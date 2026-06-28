import { readdir } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);

export async function scanGeotaggedPhotos(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(root, entry.name))
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));

  const records = [];

  for (const filePath of files) {
    const exif = await exifr.parse(filePath, {
      gps: true,
      exif: true
    }).catch(() => null);

    const takenAt =
      exif?.DateTimeOriginal instanceof Date && !Number.isNaN(exif.DateTimeOriginal.getTime())
        ? exif.DateTimeOriginal.toISOString()
        : null;

    if (!exif || typeof exif.latitude !== 'number' || typeof exif.longitude !== 'number') {
      continue;
    }

    records.push({
      id: filePath,
      filePath,
      lat: exif.latitude,
      lng: exif.longitude,
      takenAt
    });
  }

  return records;
}
