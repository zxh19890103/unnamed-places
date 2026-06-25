import https from "node:https";
import fs from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../../context.js";
import _config from "../_config.js";
import { dllock, dllocked, dllockWait, undllock } from "./_lock.js";

export const route = /^\/gootile/;
export const enabled = true;
export const pathmatch = "/gootile/:z/:x/:y";

const fallback = join(__app_root_dir, "./public/assets/fallback-gootile.jpg");

/**
 * @type {__types__.Handler<__types__.WithXYZ, { green: boolean; styled: boolean }>}
 */
export const handler = (req, res, url, params, search) => {
  const { x, y, z } = params;

  const dirpath = join(_config.paths.gootiles, `./${z}/${x}`);
  const originalFilepath = join(
    _config.paths.gootiles,
    `./${z}/${x}/${y}.jpeg`
  );

  const styledFilepath = join(
    _config.paths.gootiles,
    `./${z}/${x}/${y}.styled.png`
  );

  const styledFilepathGreen = join(
    _config.paths.gootiles,
    `./${z}/${x}/${y}.green.png`
  );

  if (dllocked(originalFilepath)) {
    dllockWait(originalFilepath, (error) => {
      if (error) {
        fs.createReadStream(fallback).pipe(res);
      } else {
        if (search.styled) {
          simplifyImage(originalFilepath, styledFilepath).then(
            (after) => {
              fs.createReadStream(styledFilepath).pipe(res);
            },
            (err) => {
              console.log(err);
              fs.rmSync(originalFilepath, { force: true });
              fs.createReadStream(fallback).pipe(res);
            }
          );
        } else if (search.green) {
          extractGreenToMask(originalFilepath, styledFilepathGreen);
        } else {
          fs.createReadStream(originalFilepath).pipe(res);
        }
      }
    });
    return;
  }

  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }

  // download origin file
  console.log("request images from google. tiles.", originalFilepath);

  dllock(originalFilepath);

  https
    .request(
      {
        host: "mt1.google.com",
        protocol: "https:",
        path: `/vt/lyrs=s&x=${x}&y=${y}&z=${z}&scale=4&hl=en`,
        headers: {
          origin: "https://google.com",
          referer: "https://google.com",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
      },
      (incomming) => {
        const originalFile = fs.createWriteStream(originalFilepath);
        console.log(
          "[google tile] downloading, is to be saved to: ",
          originalFilepath
        );

        incomming
          .pipe(originalFile)
          .on("error", (err_) => {
            undllock(originalFilepath, err_);
            logErr(err_);
          })
          .on("finish", () => {
            undllock(originalFilepath);
            console.log("[google tile] finish downloaded", originalFilepath);
            simplifyImage_del_if_error(originalFilepath, styledFilepath);
            if (fs.existsSync(originalFilepath)) {
              fs.createReadStream(originalFilepath).pipe(res);
            } else {
              fs.createReadStream(fallback).pipe(res);
            }
          });
      }
    )
    .on("error", (err_) => {
      undllock(originalFilepath, err_);
      logErr(err_);
    })
    .end();
};

const logErr = (err_) => {
  console.log(err_);
};

async function simplifyImage_del_if_error(inputPath, outputPath) {
  try {
    await simplifyImage(inputPath, outputPath);
  } catch (Err_) {
    logErr(Err_);
    fs.rmSync(inputPath, { force: true });
    console.log("[goog tile] orinal file is broken, rm it", inputPath);
  }
}

async function simplifyImage(inputPath, outputPath) {
  await sharp(inputPath)
    .median(20) // Remove noise while keeping edges
    .modulate({
      brightness: 1.5, // Significantly brighter overall
      saturation: 2.5, // Punchier, vibrant colors
      hue: 0,
    })
    .blur(1.2)
    .png({
      palette: true,
      colors: 6, // Force reduction to 16 colors
      quality: 100,
      compressionLevel: 9,
      dither: 0.0,
    })
    .resize({
      width: 1024,
      kernel: sharp.kernel.nearest,
    })
    .toFile(outputPath);

  console.log("Image simplified successfully.");
}

async function extractGreenToMask(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      // 1. Ensure we are working with standard sRGB
      .toColourspace("srgb")
      // 2. Use 'reband' or channel manipulation to highlight green.
      // A common approach is (Green - Red - Blue) to isolate saturation.
      .extractChannel("green")
      // 3. Apply a threshold. Pixels above '128' become white (255),
      // pixels below become black (0).
      .threshold(140)
      .toFile(outputPath);

    console.log("Green area mask generated successfully.");
  } catch (error) {
    console.error("Error processing spatial imagery:", error);
  }
}
