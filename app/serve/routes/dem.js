import https from "node:https";
import fs from "node:fs";
import sharp from "sharp";
import { exec } from "node:child_process";
import { join } from "node:path";
import _config from "../_config.js";

export const route = /^\/dem/;

export const pathmatch = "/dem/:z/:x/:y";

export const enabled = true;

/**
 * @type {__types__.Handler<__types__.WithXYZ, { bbox: string }>}
 */
export const handler = (req, res, _url, params, query) => {
  if (!query.bbox) {
    res.statusCode = 422;
    res.end();
    return;
  }

  const bbox = query.bbox.split(",");

  console.log("bbox", bbox);

  const tX = params.x;
  const tY = params.y;
  const tZ = params.z;

  const savetoPicture = join(_config.paths.demdata, `./${tZ}-${tX}-${tY}.png`);

  if (fs.existsSync(savetoPicture)) {
    res.setHeader("Content-Type", "image/png");
    fs.createReadStream(savetoPicture).pipe(res);
    return;
  }

  const savetoGtiff = join(_config.paths.demdata, `./${tZ}-${tX}-${tY}.gtiff`);

  if (fs.existsSync(savetoGtiff)) {
    console.log("got gtiff file, so just convert it.", savetoGtiff);
    convertsion_gdal_translate(savetoGtiff, savetoPicture, (msg) => {
      if (msg) {
        res.setHeader("Content-Type", "image/png");
        fs.createReadStream(savetoPicture).pipe(res);
      } else {
        res.statusCode = 500;
        res.end();
      }
    });
    return;
  }

  const forwardsToUrl = `https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south=${bbox[0]}&north=${bbox[2]}&west=${bbox[1]}&east=${bbox[3]}&outputFormat=GTiff&API_Key=17f93d71fccb58e27e4cc8983c502fc3`;

  console.log("url", forwardsToUrl);
  // gdaldem aspect input_dem.tif output_aspect.png -of PNG
  // gdaldem slope input_dem.tif output_slope.png -of PNG

  const client = https
    .get(
      forwardsToUrl,
      {
        headers: {
          accept: "*/*",
        },
      },
      (incoming) => {
        console.log("[dem] incoming...");
        const file = fs.createWriteStream(savetoGtiff, "binary");

        incoming
          .pipe(file)
          .on("finish", () => {
            console.log("saved as gtiff", savetoGtiff);
            convertsion_gdal_translate(savetoGtiff, savetoPicture, (msg) => {
              if (msg) {
                res.setHeader("Content-Type", "image/png");
                fs.createReadStream(savetoPicture).pipe(res);
              } else {
                res.statusCode = 500;
                res.end();
              }
            });
          })
          .on("error", logErr);
      }
    )
    .on("error", logErr);

  client.end();
};

async function convertsion_gdal_translate(
  savetoGtiff,
  savetoPicture,
  callback
) {
  const execFile = _config.cmds.gdal_translate;

  const { channels } = await sharp(savetoGtiff).stats();

  const minElevation = channels[0].min;
  const maxElevation = channels[0].max;

  fs.writeFileSync(
    `${savetoGtiff}.elevation.json`,
    JSON.stringify({
      span: maxElevation - minElevation,
      minElevation,
      maxElevation,
    }),
    "utf-8"
  );

  // gdal_translate -ot Byte -of PNG -scale 0 10 0 255 /Users/xhzhang1911/WorkSpace/unveil-landing/_quickdemo/datadem/16-50746-28071.gtiff /var/abc.png

  console.log("write elevation file.");
  console.log("minElevation, maxElevation", minElevation, maxElevation);

  console.log("[dem] start Conversion");
  exec(
    `"${execFile}" -ot Byte -of PNG -scale ${minElevation} ${maxElevation} 0 255 ${savetoGtiff} ${savetoPicture}`,
    (err, stdout, stderr) => {
      if (err) {
        logErr(err, "dal err");
        callback(null);
        return;
      }

      if (stderr) {
        console.log("Conversion finished with warn!", savetoPicture);
        // just warn!
        logErr(stderr, "dal stderr");
        callback(savetoPicture);
        return;
      }

      console.log(`GDAL stdout: ${stdout}`);
      console.log("Conversion finished totally right!", savetoPicture);
      callback(savetoPicture);
    }
  );
}

const logErr = (err_, label) => {
  console.log(`>>>>>>>>>${label}`);
  console.log(err_);
  console.log(`<<<<<<<<${label}`);
};

// exec(
//   `
//   "${_config.cmds.gdal_dem}" slope ../.cache/demdata/12-3271-1786.gtiff ../.temp/output_slope.gtiff -of GTiff
//   `.trim(),
//   (err_, stdout, stderr) => {
//     if (err_) console.log(err_);
//     else console.log(stdout);
//   }
// );

// exec(
//   `
//   "${_config.cmds.gdal_translate}" -ot UInt16 -of PNG -scale 0 90 0 65535  ../.temp/output_slope.gtiff ../.temp/output_slope.png
//   `.trim(),
//   (err_, stdout, stderr) => {
//     if (err_) console.log(err_);
//     else console.log(stdout);
//   }
// );
