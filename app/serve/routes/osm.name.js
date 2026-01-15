import fs from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import _config from "../_config.js";

export const route = /^osm-name/;
export const pathmatch = "/osm-name/:tag/:z/:x/:y/:file";
export const enabled = true;

/**
 * @type {__types__.Handler< __types__.WithXYZ<{ tag: string;  file: 'meta' | 'name'}>>}
 */
export const handler = (req, res, url, params, search) => {
  const filename = `${params.tag}-${params.z}-${params.x}-${params.y}`;

  const osmfile = join(_config.paths.osmdata, `./${filename}.geojson`);
  const nameTexfile = join(_config.paths.osmdata, `./${filename}.name.png`);
  const nameMetafile = join(_config.paths.osmdata, `./${filename}.meta.json`);

  //   if (params.file === "name" && fs.existsSync(nameTexfile)) {
  //     fs.createReadStream(nameTexfile).pipe(res);
  //     return;
  //   }

  //   if (params.file === "meta" && fs.existsSync(nameMetafile)) {
  //     fs.createReadStream(nameMetafile).pipe(res);
  //     return;
  //   }

  if (fs.existsSync(osmfile)) {
    const geojson = JSON.parse(fs.readFileSync(osmfile, "utf8"));

    createSprite(geojson, nameTexfile, nameMetafile).then(
      () => {
        if (params.file === "meta") {
          fs.createReadStream(nameMetafile).pipe(res);
        } else if (params.file === "name") {
          fs.createReadStream(nameTexfile).pipe(res);
        }
      },
      (err_) => {
        console.log(err_);
        res.end("{}", "utf8");
      }
    );
  } else {
    res.end("{}", "utf8");
  }
};

function createSprite(geojson, saveTo1, saveTo2) {
  let maxChars = 7;
  let count = 0;

  const features = geojson.features.filter(featureFilter);
  count = features.length;

  for (const feature of features) {
    maxChars = Math.max(maxChars, feature.properties.name.length);
  }

  let resolution = 2048;

  const fontSize = 24;
  const estimatedWidth = maxChars * fontSize * 0.5;
  const estimatedHeight = fontSize * 1.25;

  const dw = estimatedWidth;
  const dh = estimatedHeight;

  const gapX = estimatedWidth * 0.1;
  const gapY = estimatedHeight * 0.5;

  const dy = (estimatedHeight + gapY) / 2;
  const dx = (estimatedWidth + gapX) / 2;

  const unitX = dw + gapX;
  const unitY = dh + gapY;

  let nX = 0,
    nY = 0,
    ratio = unitX / unitY;

  nX = Math.ceil(Math.sqrt(count / ratio));
  resolution = Math.max(256, Math.ceil(nX * unitX));

  nX = Math.ceil(resolution / unitX);
  nY = Math.ceil(resolution / unitY);

  resolution = Math.ceil(nX * unitX);
  nY = Math.ceil(resolution / unitY);

  console.log("output >>>>>> ");
  console.log("count", count);
  console.log("resolution", resolution);
  console.log("ratio", ratio);
  console.log("segments", nX, nY);
  console.log("output <<<<<< ");

  fs.writeFileSync(
    saveTo2,
    JSON.stringify({
      resolution,
      ratio,
      nX,
      nY,
      segments: { x: nX, y: nY },
      count,
      maxChars,
    }),
    "utf8"
  );

  console.log("meta file saved!");

  let x = 0;
  let y = 0;
  let i = 0;
  let j = 0;

  const right = resolution - dw - gapX;
  const bottom = resolution - dh - gapY;

  const svg = Buffer.from(
    `
        <svg width="${resolution}" height="${resolution}" viewBox="0 0 ${resolution} ${resolution}" xmlns="http://www.w3.org/2000/svg">
        ${features
          .map(({ geometry, properties }) => {
            x = (dw + gapX) * i;

            if (x > right) {
              i = 0;
              j++;

              x = (dw + gapX) * i;
              y = (dh + gapY) * j;
            } else {
            }

            if (y > bottom) {
              console.warn("y > bottom");
            }

            i++;

            return `<text x="${x}" y="${y}" dx="${dx}" dy="${dy}" stroke="#000" strok-width="30" fill="#000" font-weight="700" font-family="Wawati SC" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" lengthAdjust="spacingAndGlyphs" textLength="${estimatedWidth}">${properties["name"]}</text>`;
          })
          .filter(Boolean)
          .join("")}
        </svg>
        `.trim()
  );

  return sharp({
    create: {
      width: resolution,
      height: resolution,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: svg,
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(saveTo1);
}

const featureFilter = ({ properties, geometry }) => {
  return (
    Boolean(properties.building) &&
    Boolean(properties.name) &&
    geometry.type === "Polygon"
  );
};
