import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs";
import { join } from "node:path";

import { __client_root_src_dir } from "../../context.js";
import { __tw_file_cache_id, moduleCache } from "../_cache.js";
import _config from "../_config.js";

export const route = /\.twcss$/;

export const enabled = true;

const inputFile = join(__client_root_src_dir, "./tailwind.style.css");
const outputFile = join(_config.paths.twdist, "./tailwind.style.css");

/**
 * @type {__types__.Handler}
 */
export const handler = (req, res) => {
  res.setHeader("Content-Type", "text/css");

  if (moduleCache.has(__tw_file_cache_id)) {
    console.log("ModuleCache Tailwindcss", inputFile);
    res.end(moduleCache.get(__tw_file_cache_id), "utf8");
    return;
  }

  const css = fs.readFileSync(inputFile, "utf8");

  console.log("PostCss");

  postcss([tailwindcss])
    .process(css, { from: inputFile, to: outputFile })
    .then((result) => {
      fs.writeFileSync(outputFile, result.css, "utf8");
      moduleCache.set(__tw_file_cache_id, result.css);
      res.end(result.css, "utf8");
      console.log("Tailwind CSS compiled successfully!");
    });
};
