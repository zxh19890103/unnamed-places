import { join } from "node:path";
import fs from "node:fs";
import { __app_root_dir } from "../../context.js";

export const route = /^\/temp/;
export const pathmatch = "/temp/:file";
export const enabled = true;

/**
 * @type {__types__.Handler<{ file: string }>}
 */
export const handler = (req, res, url, params, search) => {
  const file = join(__app_root_dir, `./serve/.temp/${params.file}`);
  fs.createReadStream(file).pipe(res);
};
