import http from "http";
import path from "path";
import ts, { ModuleKind } from "typescript";
import fs from "node:fs";
import config from "./_config.js";
import {
  __client_root_dir,
  __app_root_dir,
  __project_root_dir,
} from "../context.js";
import {
  __tw_file_cache_id,
  moduleCache,
  moduleCacheSet,
  tryModuleCacheGet,
} from "./_cache.js";
import routes from "./routes/index.js";

import md5 from "md5";
import { connectHttpReqWith, sendSSEClientScript } from "./notify/index.js";
import { URL } from "node:url";

const PORT = config.PORT;
const allowedOrigin = "*";

const IMPORTMAP = {
  imports: Object.keys(config.importmaps.imports),
};

const __tsconfigfile_path = path.join(__client_root_dir, "./tsconfig.json");

console.log("client dir", __client_root_dir);

// Load tsconfig.json compiler options
function loadTsConfig(tsconfigPath) {
  const configFileText = ts.sys.readFile(tsconfigPath);
  if (!configFileText) throw new Error(`Cannot read ${tsconfigPath}`);

  const result = ts.parseConfigFileTextToJson(tsconfigPath, configFileText);
  if (result.error) {
    throw new Error(`Error parsing tsconfig.json: ${result.error.messageText}`);
  }

  const configParseResult = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );

  if (configParseResult.errors.length) {
    throw new Error(
      "Errors parsing tsconfig.json:\n" +
        configParseResult.errors.map((e) => e.messageText).join("\n")
    );
  }

  return configParseResult.options;
}

const compilerOptions = loadTsConfig(__tsconfigfile_path);

// Custom TS transformer to rewrite import paths
/**
 *
 * @param {*} rewriteFn
 * @returns {any}
 */
function importRewriteTransformer(rewriteFn) {
  return (context) => {
    const visitor = (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const oldPath = node.moduleSpecifier.text;
        const newPath = rewriteFn(oldPath);
        if (newPath !== oldPath) {
          return ts.factory.updateImportDeclaration(
            node,
            // node.decorators,
            node.modifiers,
            node.importClause,
            ts.factory.createStringLiteral(newPath),
            node.assertClause
          );
        }
      }

      return ts.visitEachChild(node, visitor, context);
    };
    return (node) => {
      return ts.visitNode(node, visitor);
    };
  };
}

// Compile TS file with transformer, return JS code string
async function compileTsFile(filePath, rewriteFn, config = null) {
  const tsCfg = {
    ...compilerOptions,
    ...config,
  };

  console.log("[compileTsFile] file dir: ", tsCfg.rootDir);
  console.log("[compileTsFile] file:", filePath);

  const program = ts.createProgram([filePath], tsCfg);

  const sourceFile = program.getSourceFile(filePath);

  if (!sourceFile) throw new Error(`File not found: ${filePath}`);

  let outputText = "";
  let outputMap = "";

  // Custom writeFile to capture emitted files in memory
  const writeFile = (fileName, data) => {
    if (fileName.endsWith(".js")) {
      outputText = data;
    }

    if (fileName.endsWith(".js.map")) {
      outputMap = data;
    }
  };

  const transformers = {
    before: [importRewriteTransformer(rewriteFn)],
  };

  program.emit(sourceFile, writeFile, undefined, false, transformers);

  return [outputText, outputMap];
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.url === "/events-client") {
    sendSSEClientScript(req, res);
    return;
  } else if (req.url === "/events") {
    connectHttpReqWith(req, res);
    return;
  }

  if (req.url === "/favicon.ico") {
    fs.createReadStream(
      path.join(__app_root_dir, "./public/assets/tree.png")
    ).pipe(res);
    return;
  }

  for (const route of routes) {
    const url = new URL(`http://unnamed-places.dev${req.url}`);
    if (route.enabled && route.matcher.test(url.pathname)) {
      console.log("[routing] welcome to pathname: ", url.pathname);
      route.handler(req, res, url, route.getParams(url), route._getSearch(url));
      return;
    }
  }

  // default: ts and js
  try {
    const $npmregx = /^\/\$npm\/(.+)\.js$/;
    const _url = req.url;
    if ($npmregx.test(_url)) {
      // $npm/three-geojson-geometry
      res.setHeader("Content-Type", "application/javascript");
      res.statusCode = 200;
      /// consider ghost.js
      let [, pkg] = $npmregx.exec(_url);

      if (pkg.endsWith("ghost")) {
        pkg = pkg.replace("/ghost", "");
      }

      const folder = path.join(__client_root_dir, `./node_modules/${pkg}`);
      const mainfile = getEntryFile(folder);
      const isFolder = mainfile !== null;
      const esmfile = mainfile ? path.join(folder, mainfile) : `${folder}.js`;

      if (tryModuleCacheGet(req, res, esmfile)) {
        return;
      }

      if (tryGetCachedNpmjs(esmfile, res)) {
        return;
      }

      console.log(`esmfile resolved under ${pkg}!`, esmfile);

      const workdir = isFolder ? folder : path.join(folder, "..");

      const [esmCode, _] = await compileTsFile(esmfile, defaultEsmTransformer, {
        allowJs: true,
        rootDir: workdir,
        baseUrl: workdir,
        module: ModuleKind.ESNext,
        paths: [],
      });

      trySaveCachedNpmjs(esmfile, esmCode);
      moduleCacheSet(req, res, esmfile, esmCode);
    } else if (_url.endsWith(".js")) {
      // Resolve and sanitize path
      let filePath = path.join(__client_root_dir, _url);
      if (!filePath.startsWith(__client_root_dir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      filePath = filePath.replace(/\.js$/, ".ts");
      if (!fs.existsSync(filePath)) {
        filePath = filePath.replace(/\.ts$/, ".tsx");
      }

      res.setHeader("Content-Type", "application/javascript");

      console.log("[moduleCache] ts file", filePath);

      if (tryModuleCacheGet(req, res, filePath)) {
        return;
      }

      // Compile with import rewrite
      const [jsCode, _] = await compileTsFile(filePath, defaultEsmTransformer);

      moduleCacheSet(req, res, filePath, jsCode);
    } else {
      if (req.headers["accept"]?.includes("text/html")) {
        // html output.
        res.setHeader("Content-Type", "text/html");

        const htmlPath = path.join(__app_root_dir, "./index.html");

        if (tryModuleCacheGet(req, res, htmlPath)) {
          return;
        }

        let html = fs.readFileSync(htmlPath, "utf8");

        html = html.replace(
          /<script\s+type="importmap">[\s\S]+?<\/script>/,
          '<script type="importmap">' +
            JSON.stringify({
              imports: {
                ...config.importmaps.imports,
                "$npm/": "/$npm/",
                "@/": "/src/",
              },
            }) +
            "</script>"
        );

        moduleCacheSet(req, res, htmlPath, html);
      } else {
        // it's not html request, it's something requested using javascript;
        res.statusCode = 500;
        res.end(JSON.stringify("You're requesting something unkown!"), "utf8");
      }
    }
  } catch (e) {
    res.statusCode = 500;
    console.log(e);
    res.end("Internal Server Error:\n" + e.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  prepareDirectories();
  console.log(`TS server running at http://localhost:${PORT}`);
});

function defaultEsmTransformer(importPath) {
  const isLike3rdPartyPkg =
    !importPath.startsWith(".") &&
    !importPath.startsWith("/") &&
    !importPath.startsWith("@/");

  if (isLike3rdPartyPkg) {
    if (
      IMPORTMAP.imports.some((name) => {
        if (name.endsWith("/")) {
          return importPath.startsWith(name);
        } else {
          return importPath === name;
        }
      })
    ) {
      return importPath;
    }

    if (importPath.endsWith(".js")) {
      return "$npm/" + importPath;
    }

    // Leave node_modules or absolute imports untouched
    return "$npm/" + importPath + "/ghost.js";
  }

  // Add ".js" extension if missing
  const extname = path.extname(importPath);
  if (presevedModuleTypes.includes(extname)) {
    return importPath;
  } else {
    return `${importPath}.js`;
  }
}

const presevedModuleTypes = [".js", ".scss", ".css", ".glsl"];

function prepareDirectories() {
  Object.entries(config.paths).forEach(([_, dirpath]) => {
    if (fs.existsSync(dirpath)) return;
    fs.mkdirSync(dirpath, { recursive: true });
  });
}

function getEntryFile(npmFolder) {
  if (fs.existsSync(npmFolder)) {
    const pkg = path.join(npmFolder, "./package.json");
    if (fs.existsSync(pkg)) {
      const packageCfg = JSON.parse(fs.readFileSync(pkg, "utf-8"));
      const entry = packageCfg.module || packageCfg.main;
      if (entry) {
        return entry;
      } else {
      }
    }
    return "./index.js";
  } else {
    // no folder.
    return null;
  }
}

function tryGetCachedNpmjs(esmfile, res) {
  const id = md5(esmfile);
  const jsfile = path.join(config.paths.npmjs, `${id}.js`);
  if (fs.existsSync(jsfile)) {
    console.log("find cached file", esmfile);
    const jsCode = fs.readFileSync(jsfile, "utf-8");
    res.end(jsCode);
    moduleCache.set(esmfile, jsCode);
    return true;
  } else {
    return false;
  }
}

function trySaveCachedNpmjs(esmfile, jsCode) {
  const id = md5(esmfile);
  const jsfile = path.join(config.paths.npmjs, `${id}.js`);
  fs.writeFileSync(jsfile, jsCode, "utf-8");
  console.log("jscode saved", esmfile);
}
