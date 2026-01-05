// cache
const moduleCache = new Map();
const __tw_file_cache_id = "tailwindcssfile";

/**
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} key
 * @param {string} content
 */
export function moduleCacheSet(req, res, key, content) {
  moduleCache.set(key, content);
  res.end(content, "utf8");
}

/**
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} key
 */
export function tryModuleCacheGet(req, res, key) {
  if (moduleCache.has(key)) {
    res.end(moduleCache.get(key), "utf8");
    return true;
  }

  return false;
}

export { moduleCache, __tw_file_cache_id };
