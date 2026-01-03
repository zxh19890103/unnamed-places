import { join } from "node:path";
import { __client_root_dir } from "../../context.js";
import * as sass from "sass";
import md5 from "md5";

export const route = /\.scss$/;

export const enabled = true;

export const handler = (req, res) => {
  const referer = req.headers["referer"];

  const file = join(__client_root_dir, req.url);
  const comipledCss = sass.compile(file, {});

  if (referer && referer.endsWith(".js")) {
    res.setHeader("Content-Type", "application/javascript");
    const id = md5(file);

    res.end(
      `__dev_mount_css__("${id}", \`${comipledCss.css}\`, false);`,
      "utf8"
    );
  } else {
    // it's module.
    res.setHeader("Content-Type", "text/css");
    res.end(comipledCss.css, "utf8");
  }
};
