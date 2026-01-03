import { join } from "node:path";
import fs from "node:fs";
import { __app_root_dir } from "../../context.js";

export const route = /^\/public\//;

export const enabled = true;

export const handler = (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  const filepath = join(__app_root_dir, "." + req.url);
  fs.createReadStream(filepath).pipe(res);
};
