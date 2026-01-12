import { join } from "node:path";
import fs from "node:fs";
import { __app_root_dir } from "../../context.js";

export const route = /^\/steal/;
export const pathmatch = "/steal/:id/:cat/:n";
export const enabled = true;

/**
 * @type {__types__.Handler<{ id: string; cat: string; n: number }>}
 */
export const handler = (req, res, url, params, search) => {
  const file = join(
    __app_root_dir,
    `./steal/${params.id}/${params.cat}/${params.n}.png`
  );

  fs.createReadStream(file).pipe(res);
};
