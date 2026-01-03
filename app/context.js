import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __app_root_dir = __dirname;
const __project_root_dir = join(__dirname, "../");
const __client_root_dir = join(__dirname, "./client");
const __client_root_src_dir = join(__dirname, "./client/src");

export {
  __client_root_dir,
  __client_root_src_dir,
  __dirname,
  __filename,
  __app_root_dir,
  __project_root_dir,
};
