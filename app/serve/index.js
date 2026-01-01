import http from "http";
import path from "path";
import ts, { ModuleKind } from "typescript";
import fs from "node:fs";
import chokidar from "chokidar";
import config from "./_config.js";

import md5 from "md5";

const PORT = 1989;
const allowedOrigin = "*";

const IMPORTMAP = {
  imports: Object.keys(config.importmaps.imports),
};

const CLIENT_ROOT_DIR = path.resolve("../client");
const TSCONFIG_PATH = path.join(CLIENT_ROOT_DIR, "./tsconfig.json");
const WATCHED_FOLDERS = config.projects;

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

const compilerOptions = loadTsConfig(TSCONFIG_PATH);

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

  console.log("tsconfig rootDir: ", tsCfg.rootDir);
  console.log("file:", filePath);

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

// cache
const moduleCache = new Map();

// Watch TypeScript files in the 'src' folder
const watcher = chokidar.watch(
  WATCHED_FOLDERS.map((folder) => {
    return `./${folder}/**/*.{ts,tsx}`;
  }),
  {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true,
  }
);

const onSourceChanged = (_path) => {
  const filepath = path.join(CLIENT_ROOT_DIR, _path);
  if (moduleCache.has(filepath)) {
    moduleCache.delete(filepath);
  }

  notifySseReqClients("reload");
  console.log("source file changed", _path);
};

watcher
  // .on("add", () => {})
  .on("change", onSourceChanged)
  .on("unlink", onSourceChanged);

const sseReqClients = new Set();

const notifySseReqClients = (type) => {
  sseReqClients.forEach((res) => {
    res.write(`event: ${type}\ndata: hello\n\n`);
  });
};

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.url === "/events-client") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(
      `
      const end = "http://" + location.hostname + ":" + ${PORT} + "/events";
      const __evtSource__ = new EventSource(end);
      __evtSource__.addEventListener("reload", () => {
        window.location.reload();
      });
      `
    );
    return;
  } else if (req.url === "/events") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    sseReqClients.add(res);

    req.on("close", () => {
      res.end();
      sseReqClients.delete(res);
    });
    return;
  }

  // default: ts and js
  try {
    const regx = /^\/\$npm\/(.+)\.js$/;
    if (regx.test(req.url)) {
      // $npm/three-geojson-geometry
      res.setHeader("Content-Type", "application/javascript");
      res.statusCode = 200;
      /// consider ghost.js
      let [, pkg] = regx.exec(req.url);

      if (pkg.endsWith("ghost")) {
        pkg = pkg.replace("/ghost", "");
      }

      const folder = path.join(CLIENT_ROOT_DIR, `./node_modules/${pkg}`);
      const mainfile = getEntryFile(folder);
      const isFolder = mainfile !== null;
      const esmfile = mainfile ? path.join(folder, mainfile) : `${folder}.js`;

      if (moduleCache.has(esmfile)) {
        res.end(moduleCache.get(esmfile));
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

      moduleCache.set(esmfile, esmCode);
      res.end(esmCode);
    } else {
      if (!req.url.endsWith(".js")) {
        res.statusCode = 404;
        res.end("Only .js files are served");
        return;
      }

      // Resolve and sanitize path
      let filePath = path.join(CLIENT_ROOT_DIR, req.url);
      if (!filePath.startsWith(CLIENT_ROOT_DIR)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      filePath = filePath.replace(/\.js$/, ".ts");
      if (!fs.existsSync(filePath)) {
        filePath = filePath.replace(/\.ts$/, ".tsx");
      }

      res.setHeader("Content-Type", "application/javascript");

      // console.log("ts file", filePath);
      if (moduleCache.has(filePath)) {
        res.end(moduleCache.get(filePath));
        return;
      }

      // Compile with import rewrite
      const [jsCode, _] = await compileTsFile(filePath, defaultEsmTransformer);

      res.setHeader("Content-Type", "application/javascript");
      moduleCache.set(filePath, jsCode);
      res.end(jsCode);
    }
  } catch (e) {
    res.statusCode = 500;
    console.log(e);
    res.end("Internal Server Error:\n" + e.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
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
  if (importPath.endsWith(".js")) {
    return importPath;
  }

  return importPath + ".js";
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

const npmjsfileSavedto = `.cache/npmjs`;

function tryGetCachedNpmjs(esmfile, res) {
  const id = md5(esmfile);
  const jsfile = path.join(CLIENT_ROOT_DIR, npmjsfileSavedto, `${id}.js`);
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
  const jsfile = path.join(CLIENT_ROOT_DIR, npmjsfileSavedto, `${id}.js`);
  fs.writeFileSync(jsfile, jsCode, "utf-8");
  console.log("jscode saved", esmfile);
}
