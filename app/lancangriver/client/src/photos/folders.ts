export const PHOTO_FOLDERS_KEY = 'lancangriver.photo-folders.v1';
const CHANGE_EVENT = 'photo-folders-changed';

export type PhotoFolderPreferences = {
  version: 1;
  roots: string[];
  revision: string;
};

function uniqueRoots(roots: string[]): string[] {
  return [...new Set(roots.filter((root) => root.length > 0))];
}

export function savePhotoFolders(roots: string[]): PhotoFolderPreferences {
  const preferences: PhotoFolderPreferences = {
    version: 1,
    roots: uniqueRoots(roots),
    revision: crypto.randomUUID(),
  };
  localStorage.setItem(PHOTO_FOLDERS_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return preferences;
}

export function readPhotoFolders(): PhotoFolderPreferences {
  const saved = localStorage.getItem(PHOTO_FOLDERS_KEY);
  if (saved === null) {
    const configuredRoots = import.meta.env.VITE_PHOTOS_ROOT;
    const roots =
      typeof configuredRoots === 'string'
        ? configuredRoots
            .split(',')
            .map((root) => root.trim())
            .filter(Boolean)
        : [];
    return savePhotoFolders(roots);
  }

  let preferences: PhotoFolderPreferences;
  try {
    preferences = JSON.parse(saved);
  } catch {
    throw new Error('Saved photo folders could not be read. Reset them in Photo Settings.');
  }
  if (
    !preferences ||
    preferences.version !== 1 ||
    !Array.isArray(preferences.roots) ||
    preferences.roots.some((root) => typeof root !== 'string' || !root) ||
    typeof preferences.revision !== 'string'
  ) {
    throw new Error('Saved photo folders are invalid. Reset them in Photo Settings.');
  }
  return { ...preferences, roots: uniqueRoots(preferences.roots) };
}

export function subscribePhotoFolders(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PHOTO_FOLDERS_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', listener);
  window.addEventListener('pageshow', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', listener);
    window.removeEventListener('pageshow', listener);
  };
}

export function getPhotoSettingsUrl(): string {
  if (window.location.protocol === 'file:') {
    const currentUrl = new URL(window.location.href);
    const rootUrl = currentUrl.pathname.includes('/src/')
      ? new URL(currentUrl.href.slice(0, currentUrl.href.indexOf('/src/') + 1))
      : new URL('./', currentUrl);
    return new URL('src/photo-settings/index.html', rootUrl).href;
  }
  return new URL('/photo-settings', window.location.origin).href;
}
