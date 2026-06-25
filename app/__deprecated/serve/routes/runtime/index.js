import fs from "node:fs";
import { join } from "node:path";
import { __app_root_dir } from "../../../context.js";

export const route = /^\/runtime$/;

export const enabled = true;

export const handler = (req, res) => {
  res.setHeader("Content-Type", "application/javascript");

  fs.createReadStream(
    join(__app_root_dir, "./serve/routes/runtime/client.js")
  ).pipe(res);
};
