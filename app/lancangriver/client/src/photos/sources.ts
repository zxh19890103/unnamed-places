import { BASE_URL } from '../calc/constants';
import { normalizePhotoRecords } from './normalize';
import type { PhotoRecord } from './types';
import { readPhotoFolders } from './folders';

type FetchOptions = { mode: 'dev'; devRoot?: string } | { mode: 'prod' };

type ElectronPhotosBridge = {
  pickAndLoadGeotaggedPhotos: () => Promise<unknown[]>;
  pickPhotoDirectories?: () => Promise<{ canceled: boolean; roots: string[] }>;
};

export function getElectronPhotosBridge(): ElectronPhotosBridge | undefined {
  const host = (globalThis as { window?: Window }).window;
  if (host?.electronPhotos) return host.electronPhotos;
  try {
    return host?.parent?.electronPhotos;
  } catch {
    return undefined;
  }
}

export async function getProdPhotosViaElectron(): Promise<PhotoRecord[]> {
  const bridge = getElectronPhotosBridge();

  if (!bridge?.pickAndLoadGeotaggedPhotos) {
    return [];
  }

  const raw = await bridge.pickAndLoadGeotaggedPhotos();
  return normalizePhotoRecords(Array.isArray(raw) ? raw : []);
}

export type PhotoFolderResult = {
  root: string;
  photos: PhotoRecord[];
  warnings: { path: string; reason: string }[];
  warningCount: number;
  error?: string;
};

export async function loadPhotoFolders(
  roots: string[],
  signal?: AbortSignal,
): Promise<PhotoFolderResult[]> {
  const results: PhotoFolderResult[] = [];
  const uniqueRoots = [...new Set(roots)];
  for (let offset = 0; offset < uniqueRoots.length; offset += 2) {
    signal?.throwIfAborted();
    results.push(
      ...(await Promise.all(
        uniqueRoots.slice(offset, offset + 2).map(async (root): Promise<PhotoFolderResult> => {
          try {
            const response = await fetch(
              `${BASE_URL}/photos/geotagged?root=${encodeURIComponent(root)}&recursive=true`,
              { signal },
            );
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error?.reason || `Photo scan failed (${response.status})`);
            return {
              root,
              photos: normalizePhotoRecords(Array.isArray(body.photos) ? body.photos : []),
              warnings: Array.isArray(body.warnings) ? body.warnings : [],
              warningCount: typeof body.warningCount === 'number' ? body.warningCount : 0,
            };
          } catch (error) {
            signal?.throwIfAborted();
            return {
              root,
              photos: [],
              warnings: [],
              warningCount: 0,
              error: error instanceof Error ? error.message : 'Could not load folder',
            };
          }
        }),
      )),
    );
  }
  return results;
}

export function mergePhotoFolderResults(results: PhotoFolderResult[]): PhotoRecord[] {
  const photos = new Map<string, PhotoRecord>();
  for (const result of results) {
    for (const photo of result.photos) photos.set(photo.id, photo);
  }
  return [...photos.values()];
}

export async function fetchGeotaggedPhotos(options: FetchOptions): Promise<PhotoRecord[]> {
  if (options.mode === 'prod') return getProdPhotosViaElectron();
  const roots = options.devRoot
    ? options.devRoot
        .split(',')
        .map((root) => root.trim())
        .filter(Boolean)
    : readPhotoFolders().roots;
  return mergePhotoFolderResults(await loadPhotoFolders(roots));
}
