import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: "html-route-aliases",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/portal" || req.url === "/portal/") {
            req.url = "/portal.html";
          }

          if (req.url === "/jobs" || req.url === "/jobs/") {
            req.url = "/jobs.html";
          }

          if (
            req.url === "/experiments/tile12-osm" ||
            req.url === "/experiments/tile12-osm/"
          ) {
            req.url = "/experiments-tile12-osm.html";
          }

          next();
        });
      },
    },
  ],
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        flat: fileURLToPath(new URL("./flat.html", import.meta.url)),
        portal: fileURLToPath(new URL("./portal.html", import.meta.url)),
        jobs: fileURLToPath(new URL("./jobs.html", import.meta.url)),
        tile12Osm: fileURLToPath(
          new URL("./experiments-tile12-osm.html", import.meta.url),
        ),
      },
    },
  },
});
