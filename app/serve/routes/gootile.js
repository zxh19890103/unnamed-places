import https from "node:https";
import fs from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../../context.js";
import _config from "../_config.js";
import { dllock, dllocked, dllockWait, undllock } from "./_lock.js";
import { getCacheGootileImagepath, pullGootile } from "./_shared.js";

export const route = /^\/gootile/;
export const enabled = true;
export const pathmatch = "/gootile/:z/:x/:y";

const fallback = join(__app_root_dir, "./public/assets/fallback-gootile.jpg");

/**
 * @type {__types__.Handler<__types__.WithXYZ, { scale: 1 | 2 | 4 }>}
 */
export const handler = (req, res, url, params, search) => {
  const { x, y, z } = params;

  let scale = search.scale ?? 1;

  if (!(scale === 1 || scale === 2 || scale === 4)) {
    scale = 1;
  }

  const gooTileSaveTo = getCacheGootileImagepath(z, x, y, scale);

  if (dllocked(gooTileSaveTo)) {
    dllockWait(gooTileSaveTo, (error) => {
      fs.createReadStream(error ? fallback : gooTileSaveTo).pipe(res);
    });
    return;
  }

  if (fs.existsSync(gooTileSaveTo)) {
    fs.createReadStream(gooTileSaveTo).pipe(res);
    return;
  }

  // download origin file
  console.log("request images from google. tiles.", gooTileSaveTo);

  pullGootile(gooTileSaveTo, z, x, y, scale);
  dllockWait(gooTileSaveTo, (err_) => {
    if (err_) {
      fs.createReadStream(fallback).pipe(res);
    } else {
      fs.createReadStream(gooTileSaveTo).pipe(res);
    }
  });
};
