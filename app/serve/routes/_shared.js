import https from "node:https";
import fs from "node:fs";
import { dllock, undllock } from "./_lock.js";
import { join } from "node:path";
import _config from "../_config.js";

/**
 *
 * @param {string} filename
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 */
export const pullGootile = (filename, z, x, y, scale) => {
  dllock(filename);

  const zxFolder = join(_config.paths.gootiles, `./${z}/${x}`);

  if (!fs.existsSync(zxFolder)) {
    fs.mkdirSync(zxFolder, { recursive: true });
  }

  https
    .request(
      {
        host: "mt1.google.com",
        protocol: "https:",
        path: `/vt/lyrs=s&x=${x}&y=${y}&z=${z}&scale=${scale ?? 1}&hl=en`,
        headers: {
          origin: "https://google.com",
          referer: "https://google.com",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
      },
      (incomming) => {
        const file = fs.createWriteStream(filename);
        console.log("[google tile] downloading, is to be saved to: ", filename);

        incomming
          .pipe(file)
          .on("error", (err_) => {
            undllock(filename, err_);
            logErr(err_);
          })
          .on("finish", () => {
            console.log("[google tile] finish downloaded", filename);
            undllock(filename);
          });
      }
    )
    .on("error", (err_) => {
      undllock(filename, err_);
      logErr(err_);
    })
    .end();
};

/**
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 */
export const getCacheGootileImagepath = (z, x, y, scale) => {
  return join(_config.paths.gootiles, `./${z}/${x}/${y}@${scale}.jpeg`);
};

const logErr = (err) => {
  console.log("\n\n\n===============[Google tile pulling error]");
  console.log(err);
  console.log("===================[Google tile pulling error]\n\n\n");
};
