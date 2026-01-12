import { join } from "node:path";
import _config from "../_config.js";
import { exec } from "node:child_process";
import fs from "node:fs";

export const route = /^\/normal/;

export const pathmatch = "/normal/:z/:x/:y";

export const enabled = true;

/**
 * @type {__types__.Handler<__types__.WithXYZ>}
 */
export const handler = (req, res, url, params, search) => {
  const gtifffile = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.gtiff`
  );

  const gtifffile_slope = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.slope.gtiff`
  );

  const pngfile_slope = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.slope.png`
  );

  //   if (fs.existsSync(pngfile_slope)) {
  //     fs.createReadStream(pngfile_slope).pipe(res);
  //     return;
  //   }

  const command = `
    "${_config.cmds.gdal_dem}" slope "${gtifffile}" "${gtifffile_slope}" -of GTiff -s 111120 -compute_edges \n

    "${_config.cmds.gdal_translate}" -ot UInt16 -of PNG -scale 0 90 0 65535  "${gtifffile_slope}" "${pngfile_slope}"
    `;

  console.log("[normal]", "command: ", command);

  exec(command, { encoding: "buffer" }, (err_, stdout, stderr) => {
    if (err_) {
      console.log(err_);
      res.statusCode = 500;
      res.end(JSON.stringify({ err: err_.message }), "utf8");
      return;
    }

    console.log(stderr.toString("utf8"));
    console.log(stdout.toString("utf8"));

    fs.createReadStream(pngfile_slope).pipe(res);
  });
};
