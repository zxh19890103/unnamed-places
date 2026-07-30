import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  appType: "mpa",
  server: {
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/portal" || req.url === "/portal/") {
          req.url = "/portal.html";
        }

        next();
      });
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        flat: fileURLToPath(new URL("./flat.html", import.meta.url)),
        portal: fileURLToPath(new URL("./portal.html", import.meta.url)),
      },
    },
  },
});
