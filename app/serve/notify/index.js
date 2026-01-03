import chokidar from "chokidar";
import { join, relative } from "node:path";
import {
  __app_root_dir,
  __client_root_dir,
  __client_root_src_dir,
} from "../../context.js";
import { __tw_file_cache_id, moduleCache } from "../_cache.js";
import config from "../_config.js";
import md5 from "md5";

// Watch TypeScript files in the 'src' folder
const fsUpdateWatcher = chokidar.watch(
  [
    join(__client_root_src_dir, `./**/*.{ts,tsx,scss,css,glsl}`),
    join(__app_root_dir, `./index.html`),
  ],
  {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true,
  }
);

const onSourceChanged = (_path) => {
  if (moduleCache.has(_path)) {
    if (_path.endsWith(".tsx")) {
      moduleCache.delete(__tw_file_cache_id);
    }

    moduleCache.delete(_path);
  } else {
    //
  }

  if (_path.endsWith(".scss")) {
    // For style, hot replacement
    notifySseReqClients("style", {
      file: relative(__client_root_dir, _path),
      md5id: md5(_path),
    });
  } else {
    // For Ts, just reload.
    notifySseReqClients("reload");
  }

  console.log("source file changed", _path);
};

fsUpdateWatcher
  .on("change", onSourceChanged)
  .on("unlink", onSourceChanged)
  .on("ready", () => {
    console.log("[fs update watcher]", "ready");
  });

const sseReqClients = new Set();

export const connectHttpReqWith = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  sseReqClients.add(res);

  req.on("close", () => {
    res.end();
    sseReqClients.delete(res);
  });
};

export const sendSSEClientScript = (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.end(
    `
    const __eventsource__end__ = "http://" + location.hostname + ":" + ${config.PORT} + "/events";
    const __eventsource__ = new EventSource(__eventsource__end__);
    __eventsource__.addEventListener("reload", () => {
        window.location.reload();
    });
    __eventsource__.addEventListener("style", (event) => {
        const { file, md5id } = JSON.parse(event.data);
        __dev_mount_css__(md5id, file, true);
    });
    `
  );
};

/**
 *
 * @param {'reload' | 'style'} type
 * @param {any} payload
 */
const notifySseReqClients = (type, payload = null) => {
  sseReqClients.forEach((res) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  });
};
