import https from "node:https";
import fs from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../../context.js";
import _config from "../_config.js";

export const route = /^\/gootile-mask/;
export const enabled = true;
export const pathmatch = "/gootile-mask/:z/:x/:y";

/**
 * @type {__types__.Handler<__types__.WithXYZ, { green: boolean; styled: boolean }>}
 */
export const handler = (req, res, url, params, search) => {
  const { x, y, z } = params;

  //   const dirpath = join(_config.paths.gootiles, `./${z}/${x}`);

  const originalFilepath = join(
    _config.paths.gootiles,
    `./${z}/${x}/${y}@4.jpeg`,
  );

  generateVARIAnalysis(originalFilepath).then(
    (stream) => {
      res.writeHead(200, {
        "Content-Type": "image/png",
        // Optional: Enable CORS so THREE.js can load it from different domains
        "Access-Control-Allow-Origin": "*",
      });
      res.end(stream);
    },
    (err_) => {
      console.log(err_);
    },
  );
};

async function generateVARIAnalysis(originalFile) {
  const { data, info } = await sharp(originalFile)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const outputBuffer = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // VARI Formula: (G - R) / (G + R - B)
    const numerator = g - r;
    const denominator = g + r - b;

    // Avoid division by zero and normalize to 0-255
    let vari = denominator !== 0 ? numerator / denominator : 0;

    // VARI usually ranges from -1 to 1.
    // We map 0.0 -> 1.0 range to 0 -> 255 for our "Capacity Map"
    const normalized = Math.max(0, Math.min(255, vari * 255));

    outputBuffer[i] = 0; // Red: Clear (use for buildings later)
    outputBuffer[i + 1] = normalized > 30 ? normalized : 0; // Green: Binary Mask
    outputBuffer[i + 2] = 0; // Blue: Plant Capacity (Varying density)
  }

  return sharp(outputBuffer, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}
