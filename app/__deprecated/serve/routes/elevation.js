import fs from "node:fs";
import { join } from "node:path";
import _config from "../_config.js";

export const route = /^\/elevation/;

export const pathmatch = "/elevation/:z/:x/:y";

export const enabled = true;

/**
 * @type {__types__.Handler<__types__.WithXYZ>}
 */
export const handler = (req, res, _url, params) => {
  const tX = params.x;
  const tY = params.y;
  const tZ = params.z;

  console.log("xyz", tX, tY, tZ);

  const elevationFile = join(
    _config.paths.demdata,
    `./${tZ}-${tX}-${tY}.gtiff.elevation.json`
  );

  res.setHeader("Content-Type", "application/json");

  if (fs.existsSync(elevationFile)) {
    fs.createReadStream(elevationFile).pipe(res);
  } else {
    res.statusCode = 200;

    res.end(
      JSON.stringify({
        span: 0,
        minElevation: 0,
        maxElevation: 0,
      }),
      "utf8"
    );
  }
};
