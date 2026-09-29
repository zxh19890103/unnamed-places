import { type Scene } from 'three';

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
  photos: PhotoRecord[];
};

export type JourneyChipNode = {
  chipKey: string;
  photos: PhotoRecord[];
};

export type JourneyGeoNode = {
  chipKey: string;
  displayLabel: string;
  photoCount: number;
  representativeLat: number;
  representativeLng: number;
  photoIds: string[];
  photos: PhotoRecord[];
};

type JourneyBuildResultBucket = Map<string, PhotoRecord[]>;

export type JourneyBuildResult = {
  days: JourneyDayNode[];
  geoNodes: JourneyGeoNode[];
  chipNodes: JourneyChipNode[];
  buckets: JourneyBuildResultBucket;
  geoBuckets: JourneyBuildResultBucket;
  records: PhotoRecord[];
  skippedInvalidCoordinateCount: number;
};

export interface JourneyPhotosCapacities {
  scene: Scene;
  onDaySelect: (day: JourneyDayNode) => void;
  onGeoOpen: (geoNode: JourneyGeoNode) => void;
  onGeoClose: (geoNode: JourneyGeoNode) => void;
  onPhotoSelect: (photo: PhotoRecord, geoNode: JourneyGeoNode) => void;
  onLoaded: (journey: JourneyBuildResult) => void;
  onMotionsToggle?: (visible: boolean, journey: JourneyBuildResult) => void;
}
