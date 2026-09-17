import { BASE_URL } from '../calc/constants';
import { normalizePhotoRecords } from './normalize';
import type { PhotoRecord } from './types';

type FetchOptions = { mode: 'dev'; devRoot?: string } | { mode: 'prod' };

type ElectronPhotosBridge = {
  pickAndLoadGeotaggedPhotos: () => Promise<unknown[]>;
};

function getElectronPhotosBridge(): ElectronPhotosBridge | undefined {
  return (globalThis as { window?: { electronPhotos?: ElectronPhotosBridge } }).window
    ?.electronPhotos;
}

export async function getProdPhotosViaElectron(): Promise<PhotoRecord[]> {
  const bridge = getElectronPhotosBridge();

  if (!bridge?.pickAndLoadGeotaggedPhotos) {
    return [];
  }

  const raw = await bridge.pickAndLoadGeotaggedPhotos();
  return normalizePhotoRecords(Array.isArray(raw) ? raw : []);
}

async function getDevPhotosViaService(devRoot: string): Promise<PhotoRecord[]> {
  const url = `${BASE_URL}/photos/geotagged?root=${encodeURIComponent(devRoot)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DEV photos API failed: ${response.status}`);
  }

  const body = await response.json();
  return normalizePhotoRecords(Array.isArray(body.photos) ? body.photos : []);
}

function getDevPhotosRootsFromEnv(): string[] {
  const configuredRoot = import.meta.env.VITE_PHOTOS_ROOT;

  if (typeof configuredRoot === 'string' && configuredRoot.trim().length > 0) {
    return configuredRoot
      .split(',')
      .map((root) => root.trim())
      .filter((root) => root.length > 0);
  }

  return ['/tmp/photos'];
}

export async function fetchGeotaggedPhotos(options: FetchOptions): Promise<PhotoRecord[]> {
  if (options.mode === 'dev') {
    const roots = options.devRoot
      ? options.devRoot.split(',').map((root) => root.trim())
      : getDevPhotosRootsFromEnv();

    const results = await Promise.all(
      roots.map((root) =>
        getDevPhotosViaService(root).catch((error) => {
          console.warn(`Failed to load dev photos from ${root}`, error);
          return [] as PhotoRecord[];
        }),
      ),
    );

    const seen = new Set<string>();
    return results.flat().filter((photo) => {
      if (seen.has(photo.id)) {
        return false;
      }
      seen.add(photo.id);
      return true;
    });
  }

  return getProdPhotosViaElectron();
}
