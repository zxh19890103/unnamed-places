import sharp from "sharp";
import { join } from "node:path";
import { __app_root_dir } from "../context.js";
import spriteElements from "../steal/sprite-elements.js";

const cat = "clouds";
const dimension = 4;
const size = 2048;

const tileSize = size / dimension;
const padding = 8;
const n = size / tileSize;
const aTileSize = tileSize - 2 * padding;

const images = Promise.all(
  spriteElements[cat]
    .split(/[,\s]/)
    .filter((s) => Boolean(s))
    .map((id) => {
      const file = join(
        __app_root_dir,
        `./steal/data-vecteezy/${cat}/${parseInt(id)}.png`,
      );

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
    }),
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

const destination = join(
  __app_root_dir,
  `./steal/data-vecteezy/${cat}/_in-one.png`,
);

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
