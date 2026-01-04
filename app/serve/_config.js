import { join } from "node:path";
import { __app_root_dir, __client_root_dir } from "../context.js";

const this_dir = join(__app_root_dir, "./serve");

export default {
  PORT: 1989,
  cmds: {
    gdal_translate:
      "/Applications/QGIS-LTR.app/Contents/MacOS/bin/gdal_translate",
  },
  paths: {
    twdist: join(__client_root_dir, "./dist"),
    npmjs: join(this_dir, "./.cache/npmjs"),
    gootiles: join(this_dir, "./.cache/gootiles"),
    demdata: join(this_dir, "./.cache/demdata"),
    osmdata: join(this_dir, "./.cache/osmdata"),
  },
  importmaps: {
    imports: {
      three: "/public/jslibs/three/three.module.js",
      leaflet: "/public/jslibs/leaflet/leaflet-src.esm.js",
      "three/addons/": "https://threejs.org/examples/jsm/",
      react: "https://cdn.jsdelivr.net/npm/react@19.1.0/+esm",
      "react/jsx-runtime":
        "https://cdn.jsdelivr.net/npm/react@19.1.0/jsx-runtime/+esm",
      "react-dom": "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/+esm",
      "react-dom/client":
        "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/client/+esm",
      gsap: "https://cdn.jsdelivr.net/npm/gsap@3.13.0/+esm",
    },
  },
};
