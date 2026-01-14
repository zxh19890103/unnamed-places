import fs from "node:fs";
import sharp from "sharp";

function createSprite(geojson) {
  const dw = 64;
  const dh = 16;
  const gap = 4;
  const dy = 12;
  const dx = 2;

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
              x = (dw + gap) * i;

              i++;

              if (x > 1024) {
                j++;
                y = (dh + gap) * j;
                x = 0;
                i = 0;
              }

              return `<text x="${x}" y="${y}" dx="${dx}" dy="${dy}" font-size="14" length-adjust="spacing" text-length="5em" fill="#000" font-family="Wawati SC">${properties["name"]}</text>`;
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
    JSON.stringify({
      features: Array(300)
        .fill(0)
        .map(() => {
          const name = Math.random().toString(26).substring(2, 9);

          return {
            properties: {
              name,
            },
          };
        }),
    })
  )
);
