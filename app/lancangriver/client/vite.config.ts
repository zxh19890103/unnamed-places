import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const pagesCfg = {
  portal: `./src/portal`,
  jobs: `./src/jobs`,
  ["jobs-create"]: `./src/jobs-create`,
  ["static-leaflet-map"]: `./src/static-leaflet-map`,
  ["ui-design-implement"]: `./src/ui-design-implement`,
  flat: `./src/flat`,
  ["global-zoom"]: `./src/experiments/global-zoom`,
  ["shanshui-shader"]: `./src/experiments/shanshui-shader`,
  ["sphere-zoom"]: `./src/experiments/sphere-zoom`,
  ["tile12-osm"]: `./src/experiments/tile12-osm`,
};

const pages = new Map(
  Object.entries(pagesCfg).flatMap((page) => {
    const value = { file: page[1] + "/index.html", folder: page[1] };
    return [
      ["/" + page[0], value],
      ["/" + page[0] + ".html", value],
      ["/" + page[0] + "/", value],
    ];
  }),
);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    {
      name: "html-route-aliases",
      transformIndexHtml: (html, ctx) => {
        const url = new URL(ctx.originalUrl, "http://0.0.0.0:3000");
        const page = pages.get(url.pathname);
        if (page) {
          return html.replace(
            '<script type="module" src="./main.tsx"></script>',
            `<script type="module" src="${page.folder}/main.tsx"></script>`,
          );
        } else {
          return html;
        }
      },
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = new URL(req.url, "http://0.0.0.0:3000");
          if (pages.has(url.pathname)) {
            const page = pages.get(url.pathname);
            req.url = page.file;
          }

          next();
        });
      },
    },
  ],
  appType: "mpa",
  build: {
    rollupOptions: {},
  },
});
