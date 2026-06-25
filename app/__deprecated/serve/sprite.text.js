import fs from "node:fs";
import sharp from "sharp";

let maxChars = 7;
let count = 0;

function createSprite(geojson) {
  let resolution = 2048;

  const fontSize = 24;
  const estimatedWidth = maxChars * fontSize * 0.5;
  const estimatedHeight = fontSize * 1.25;

  const dw = estimatedWidth;
  const dh = estimatedHeight;

  const gapX = estimatedWidth * 0.05;
  const gapY = estimatedHeight * 0.05;

  const dy = (estimatedHeight + gapY) / 2;
  const dx = (estimatedWidth + gapX) / 2;

  const unitX = dw + gapX;
  const unitY = dh + gapY;

  let nX = 0,
    nY = 0,
    ratio = unitX / unitY;

  nX = Math.ceil(Math.sqrt(count / ratio));
  resolution = Math.ceil(nX * unitX);

  nX = Math.ceil(resolution / unitX);
  nY = Math.ceil(resolution / unitY);

  console.log("output >>>>>> ");
  console.log("resolution", resolution);
  console.log("ratio", ratio);
  console.log("segments", nX, nY);
  console.log("output <<<<<< ");

  let x = 0;
  let y = 0;
  let i = 0;
  let j = 0;

  const right = resolution - dw - gapX;
  const bottom = resolution - dh - gapY;

  const svg = Buffer.from(
    `
        <svg width="${resolution}" height="${resolution}" view-box="0 0 ${resolution} ${resolution}" xmlns="http://www.w3.org/2000/svg">
        ${geojson.features
          .map(({ geometry, properties }) => {
            if (
              Boolean(properties.building) &&
              Boolean(properties.name) &&
              geometry.type === "Polygon"
            ) {
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
            }

            return null;
          })
          .filter(Boolean)
          .join("")}
        </svg>
        `.trim()
  );

  sharp({
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
    .toFile("./.temp/text.png");
}

const geojson = JSON.parse(
  fs.readFileSync("./.cache/osmdata/building-12-3260-1695.geojson", "utf8")
);

const features = geojson.features.filter((feature) => {
  const name = feature.properties.name;
  if (name === undefined) return false;

  maxChars = Math.max(name.length, maxChars);
  count += 1;

  return true;
});

createSprite({
  features,
});
