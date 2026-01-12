import https from "node:https";
import fs from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../../context.js";
import _config from "../_config.js";
import { dllock, dllocked, dllockWait, undllock } from "./_lock.js";
import { getCacheGootileImagepath, pullGootile } from "./_shared.js";
import { simplifyImage } from "./_pixel.js";

export const route = /^\/gootile-styled/;
export const enabled = true;
export const pathmatch = "/gootile-styled/:z/:x/:y";

const fallback = join(__app_root_dir, "./public/assets/fallback-gootile.jpg");

/**
 * @type {__types__.Handler<__types__.WithXYZ, { }>}
 */
export const handler = (req, res, url, params, search) => {
  const { x, y, z } = params;

  const originalFilepath = getCacheGootileImagepath(z, x, y, 4);

  const styledFilepath = join(
    _config.paths.gootiles,
    `./${z}/${x}/${y}.styled.png`
  );

  if (dllocked(styledFilepath)) {
    dllockWait(styledFilepath, (err_) => {
      if (err_) {
        fs.createReadStream(fallback).pipe(res);
      } else {
        fs.createReadStream(styledFilepath).pipe(res);
      }
    });
    return;
  }

  if (fs.existsSync(styledFilepath)) {
    fs.createReadStream(styledFilepath).pipe(res);
    return;
  }

  simplifyImageWrap(originalFilepath, styledFilepath, z, x, y);

  dllockWait(styledFilepath, (err_) => {
    if (err_) {
      fs.createReadStream(fallback).pipe(res);
    } else {
      fs.createReadStream(styledFilepath).pipe(res);
    }
  });
};

const simplifyImageWrap = (originalFilepath, styledFilepath, z, x, y) => {
  dllock(styledFilepath);

  if (dllocked(originalFilepath)) {
    dllockWait(originalFilepath, (err_) => {
      if (err_) {
        undllock(styledFilepath, err_);
      } else {
        doSimplifyImage(originalFilepath, styledFilepath);
      }
    });
    return;
  }

  if (fs.existsSync(originalFilepath)) {
    doSimplifyImage(originalFilepath, styledFilepath);
    return;
  }

  pullGootile(originalFilepath, z, x, y, 4);

  dllockWait(originalFilepath, (err_) => {
    if (err_) {
      undllock(styledFilepath, err_);
    } else {
      doSimplifyImage(originalFilepath, styledFilepath);
    }
  });
};

const doSimplifyImage = (originalFilepath, styledFilepath) => {
  simplifyImage(originalFilepath, styledFilepath).then(
    () => {
      undllock(styledFilepath);
    },
    (err_) => {
      undllock(styledFilepath, err_);
    }
  );
};
