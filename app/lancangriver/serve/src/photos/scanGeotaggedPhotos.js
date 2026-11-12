import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);

export async function scanGeotaggedPhotos(root, options = {}) {
  const canonicalRoot = await realpath(root);
  const directories = [canonicalRoot];
  const records = [];
  const warn = (filePath, reason) => options.onWarning?.({ path: filePath, reason });
  const checkCancelled = () => options.signal?.throwIfAborted();

  while (directories.length > 0) {
    checkCancelled();
    const directory = directories.pop();
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (directory === canonicalRoot) throw error;
      warn(directory, 'Directory could not be read');
      continue;
    }

    const files = [];
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory() && options.recursive) directories.push(filePath);
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        files.push(filePath);
      }
    }

    for (let offset = 0; offset < files.length; offset += 4) {
      checkCancelled();
      const batch = await Promise.all(
        files.slice(offset, offset + 4).map(async (filePath) => {
          const exif = await exifr.parse(filePath, { gps: true, exif: true }).catch(() => {
            warn(filePath, 'Photo metadata could not be read');
            return null;
          });

          if (!Number.isFinite(exif?.latitude) || !Number.isFinite(exif?.longitude)) {
            return null;
          }

          const takenAt =
            exif.DateTimeOriginal instanceof Date && !Number.isNaN(exif.DateTimeOriginal.getTime())
              ? exif.DateTimeOriginal.toISOString()
              : null;

          return { id: filePath, filePath, lat: exif.latitude, lng: exif.longitude, takenAt };
        }),
      );
      checkCancelled();
      records.push(...batch.filter(Boolean));
    }
  }

  return records.sort((first, second) => first.id.localeCompare(second.id));
}
