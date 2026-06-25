import fs from "node:fs";
import { join } from "node:path";
import { __client_root_dir, __client_root_src_dir } from "../../context.js";

export const route = /\.glsl$/;

export const enabled = true;

/**
 * @this {__types__.Route}
 * @param {URL} url
 */
export const getParams = function (url) {
  const pathname = url.pathname;

  const chunk = pathname.endsWith(".chunk.glsl");
  const vert = !chunk && pathname.endsWith(".vert.glsl");
  const frag = !chunk && pathname.endsWith(".frag.glsl");
  const both = !chunk && vert === false && frag === false;

  const shader = pathname.slice(0, both ? -5 : -10);

  return {
    shader,
    chunkfile: join(__client_root_dir, pathname),
    chunk,
    vertfile: join(__client_root_dir, `${shader}.vert.glsl`),
    vert: vert || both,
    fragfile: join(__client_root_dir, `${shader}.frag.glsl`),
    frag: frag || both,
  };
};

/**
 * @type {__types__.Handler<__types__.GLSLModuleFetchQuery>}
 */
export const handler = (req, res, url, params) => {
  res.setHeader("Content-Type", "application/javascript");

  const shaders = {
    vertexShader: null,
    fragmentShader: null,
    chunkShader: null,
  };

  if (params.vert && fs.existsSync(params.vertfile)) {
    shaders.vertexShader = fs.readFileSync(params.vertfile, "utf8");
  }

  if (params.frag && fs.existsSync(params.fragfile)) {
    shaders.fragmentShader = fs.readFileSync(params.fragfile, "utf8");
  }

  if (params.chunk && fs.existsSync(params.chunkfile)) {
    shaders.chunkShader = fs.readFileSync(params.chunkfile, "utf8");
  }

  res.end(
    `
    const shaders = ${JSON.stringify(shaders)};
    export default shaders;
    `,
    "utf8"
  );
};
