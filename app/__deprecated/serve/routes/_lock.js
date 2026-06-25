/**
 * @type {Map<string, { t: number; uri: string; callbacks: ((error_?: any) => void)[] }>}
 */
const locking = new Map();

/**
 *
 * @param {string} uri
 */
export const dllock = (uri) => {
  const lockInfo = { t: Date.now(), uri, callbacks: [] };
  locking.set(uri, lockInfo);
  console.log("[lock]", "locked", uri);
  return true;
};

/**
 *
 * @param {string} uri
 */
export const dllocked = (uri) => locking.has(uri);

/**
 *
 * @param {string} uri
 * @param {(err_?: any) => void} callback
 */
export const dllockWait = (uri, callback) => {
  console.log("[lock] wait", uri, locking.has(uri));

  if (!locking.has(uri)) return false;

  const lockInfo = locking.get(uri);

  lockInfo.callbacks.push(callback);

  return true;
};

/**
 *
 * @param {string} uri
 */
export const undllock = (uri, err = null) => {
  if (!locking.has(uri)) return false;

  const lockInfo = locking.get(uri);

  for (const callback of lockInfo.callbacks) {
    callback(err);
  }

  const now = Date.now();
  const elasped = Math.round((now - lockInfo.t) / 1000);
  console.log("[lock]", uri, ` unlocked, have taken: ${elasped}s`);
  locking.delete(uri);

  return true;
};
