/// <reference types="vite/client" />

// declare leaflet L: any in Global scope to avoid TypeScript errors when using Leaflet without proper type definitions;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_PHOTOS_ROOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  const L: any;

  interface Window {
    electronPhotos?: {
      pickAndLoadGeotaggedPhotos: () => Promise<unknown[]>;
    };
  }
}

export {};
