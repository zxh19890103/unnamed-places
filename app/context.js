import { dirname, join } from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __app_root_dir = __dirname;
const __project_root_dir = join(__dirname, '../');

export { __dirname, __filename, __app_root_dir, __project_root_dir };
