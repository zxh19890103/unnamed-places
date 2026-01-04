import fs from "node:fs";
import { join } from "node:path";
import { __client_root_dir, __client_root_src_dir } from "../../context.js";

export const route = /\.glsl$/;

export const enabled = true;

/**
 * @this {import('./_type.js').Route}
 * @param {URL} url
 */
export const getParams = function (url) {
  const vert = url.pathname.endsWith(".vert.glsl");
  const frag = url.pathname.endsWith(".frag.glsl");
  const both = vert === false && frag === false;

  const shader = url.pathname.slice(0, both ? -5 : -10);

  return {
    shader,
    vertfile: join(__client_root_dir, `${shader}.vert.glsl`),
    vert: vert || both,
    fragfile: join(__client_root_dir, `${shader}.frag.glsl`),
    frag: frag || both,
  };
};

/**
 * @type {import("./_type.js").Handler<{ shader: string; vertfile: string; fragfile: string; vert: boolean; frag: boolean }>}
 */
export const handler = (req, res, url, params) => {
  res.setHeader("Content-Type", "application/javascript");

  const shaders = {
    vertexShader: null,
    fragmentShader: null,
  };

  if (params.vert && fs.existsSync(params.vertfile)) {
    shaders.vertexShader = fs.readFileSync(params.vertfile, "utf8");
  }

  if (params.frag && fs.existsSync(params.fragfile)) {
    shaders.fragmentShader = fs.readFileSync(params.fragfile, "utf8");
  }

  res.end(
    `
    const shaders = ${JSON.stringify(shaders)};
    export default shaders;
    `,
    "utf8"
  );
};
