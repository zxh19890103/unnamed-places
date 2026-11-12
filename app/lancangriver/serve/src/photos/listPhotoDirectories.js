import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export async function listPhotoDirectories(options = {}) {
  const invalidConfiguration = () =>
    Object.assign(
      new Error(
        'PHOTO_BROWSE_ROOTS must be a nonempty JSON array of absolute paths, for example ["/Users/example/Documents"]',
      ),
      { code: 'INVALID_PHOTO_BROWSE_ROOTS' },
    );
  let configuredRoots;
  try {
    configuredRoots = options.roots ??
      JSON.parse(process.env.PHOTO_BROWSE_ROOTS || 'null') ?? [homedir()];
  } catch {
    throw invalidConfiguration();
  }
  if (
    !Array.isArray(configuredRoots) ||
    configuredRoots.length === 0 ||
    configuredRoots.some((root) => typeof root !== 'string' || !path.isAbsolute(root))
  ) {
    throw invalidConfiguration();
  }

  const roots = [...new Set(await Promise.all(configuredRoots.map((root) => realpath(root))))];
  const contains = (root, candidate) => {
    const relative = path.relative(root, candidate);
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
  };
  const directory = await realpath(options.directory || roots[0]);
  if (!roots.some((root) => contains(root, directory))) {
    throw Object.assign(new Error('Folder is outside the allowed browsing locations'), {
      code: 'OUTSIDE_BROWSE_ROOT',
    });
  }
  if (!(await stat(directory)).isDirectory()) {
    throw Object.assign(new Error('Select a directory'), { code: 'ENOTDIR' });
  }

  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((first, second) => first.name.localeCompare(second.name));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const limit = 100;
  const parent = path.dirname(directory);

  return {
    path: directory,
    roots,
    parent: parent !== directory && roots.some((root) => contains(root, parent)) ? parent : null,
    directories: entries.slice(offset, offset + limit).map((entry) => ({
      name: entry.name,
      path: path.join(directory, entry.name),
    })),
    nextOffset: offset + limit < entries.length ? offset + limit : null,
  };
}
