import fs from "node:fs";
import sharp from "sharp";

function createSprite(geojson) {
  const dw = 100;
  const dh = 6;

  let x = 0;
  let y = 0;
  let i = 0;
  let j = 0;

  const svg = Buffer.from(
    `
        <svg width="1024" height="1024" view-box="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        ${geojson.features
          .map(({ properties }) => {
            console.log(properties);
            if (properties.name) {
              x = dw * i;

              if (x > 1024) {
                y = dh * j;
                j++;
                x = 0;
                i = 0;
              }

              console.log(x, y);

              i++;
              return `<text x="${x}" dy="300" y="${y}"  length-adjust="spacing" text-length="5em" fill="#fe9109" font-family="Wawati SC" font-size="14">${properties["name:en"]}</text>`;
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
      width: 1024,
      height: 1024,
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

createSprite(
  JSON.parse(
    fs.readFileSync("./.cache/osmdata/building-12-3186-1768.geojson", "utf-8")
  )
);
