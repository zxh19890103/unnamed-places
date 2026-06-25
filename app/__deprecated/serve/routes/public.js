import { join, extname } from "node:path";
import fs from "node:fs";
import { __app_root_dir } from "../../context.js";

export const route = /^\/public\//;

export const enabled = true;

/**
 * @type {import("./_type.js").Handler}
 */
export const handler = (req, res, url) => {
  const ext = extname(url.pathname).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      res.setHeader("Content-Type", "image/jpeg");
      break;
    case ".png":
      res.setHeader("Content-Type", "image/png");
      break;
    case ".ico":
      res.setHeader("Content-Type", "image/x-icon");
      break;
    case ".svg":
      res.setHeader("Content-Type", "image/svg+xml");
      break;
    case ".js":
      res.setHeader("Content-Type", "application/javascript");
      break;
    case ".json":
      res.setHeader("Content-Type", "application/json");
      break;
    case ".css":
      res.setHeader("Content-Type", "text/css");
      break;
    default:
      // no declarations, some exceptions will be emitted.
      break;
  }

  const filepath = join(__app_root_dir, "." + url.pathname);
  if (fs.existsSync(filepath)) {
    fs.createReadStream(filepath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end("404", "utf8");
  }
};
