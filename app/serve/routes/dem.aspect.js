import { join } from "node:path";
import _config from "../_config.js";
import { exec } from "node:child_process";
import fs from "node:fs";

export const route = /^\/dem-aspect/;

export const pathmatch = "/dem-aspect/:z/:x/:y";

export const enabled = true;

/**
 * @type {__types__.Handler<__types__.WithXYZ>}
 */
export const handler = (req, res, url, params, search) => {
  const inputgtifffile = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.gtiff`
  );

  const outputgtifffile = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.aspect.gtiff`
  );

  const pngfile = join(
    _config.paths.demdata,
    `./${params.z}-${params.x}-${params.y}.aspect.png`
  );

  //   if (fs.existsSync(pngfile_slope)) {
  //     fs.createReadStream(pngfile_slope).pipe(res);
  //     return;
  //   }

  const command = `
    "${_config.cmds.gdal_dem}" aspect "${inputgtifffile}" "${outputgtifffile}" -of GTiff -s 111120 -compute_edges \n

    "${_config.cmds.gdal_translate}" -ot UInt16 -of PNG -scale 0 360 0 65535  "${outputgtifffile}" "${pngfile}"
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

    fs.createReadStream(pngfile).pipe(res);
  });
};
