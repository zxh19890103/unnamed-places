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

export type JourneyDayNode = {
  dayKey: string;
  displayLabel: string;
  photoCount: number;
  representativeLat: number;
  representativeLng: number;
  placeChips: string[];
  photoIds: string[];
};

export type JourneyBuildResult = {
  days: JourneyDayNode[];
  skippedInvalidCoordinateCount: number;
};
