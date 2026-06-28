export type PhotoRecord = {
  id: string;
  filePath: string;
  lat: number;
  lng: number;
  takenAt: string | null;
};

export type RawPhotoRecord = {
  id?: string;
  filePath?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  takenAt?: string | null;
};
