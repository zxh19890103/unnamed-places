import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../context.js";

const cat = "plants";
const size = 2048;
const tileSize = 256;
const padding = 8;
const n = size / tileSize;
const aTileSize = tileSize - 2 * padding;

const images = Promise.all(
  `
1, 2, 3, 4, 5, 6, 7, 8, 
9, 46, 11, 12, 13, 14, 15, 16, 
17, 18, 19, 68, 21, 22, 23, 24, 
25, 26, 27, 28, 73, 30, 31, 32, 
33, 34, 35, 36, 37, 38, 39, 40,
41, 42, 43, 44, 45, 47, 48, 76, 
50, 51, 52, 53, 54, 55, 70, 67, 
58, 59, 71, 61, 62, 63, 64, 65
  `
    .split(/[,\s]/)
    .filter((s) => Boolean(s))
    .map((id) => {
      const file = join(__app_root_dir, `./steal/data-vecteezy/${cat}/${id}.png`);

      return sharp(file)
        .trim({
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .resize({ fit: "inside", width: aTileSize, height: aTileSize })
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent padding
        })
        .toBuffer();
    })
).then((files) => {
  return files.map((file, i) => {
    const row = Math.floor(i / n);
    const col = i % n;

    /**
     * @type {sharp.OverlayOptions}
     */
    const option = {
      input: file,
      top: row * tileSize,
      left: col * tileSize,
    };

    return option;
  });
});

const destination = join(__app_root_dir, `./steal/data-vecteezy/${cat}/_in-one.png`);

images.then((files) => {
  sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(files)
    .png()
    .toFile(destination);
});
