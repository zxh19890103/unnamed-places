import * as THREE from "three";

import { mergeTileExtents, tileExtent } from "../../calc/mercator";
import { SphereTileKey } from "../_types";
import { JourneyDayNode, PhotoRecord } from "../../photos/types";
import { PhotoMarkerGeometry } from "../geometries/PhotoMarkerGeometry.class";
import { PhotoMarkerMaterial } from "../materials/PhotoMarkerMaterial.class";

export function createPhotoLocationsPresenter(params: {
  scene: THREE.Scene;
  textureLoader: THREE.TextureLoader;
  baseUrl: string;
}) {
  const { scene, textureLoader, baseUrl } = params;
  let disposeActiveLocations: VoidFunction | null = null;

  const showPhotosLocations = (
    journeyDay: JourneyDayNode,
    records: PhotoRecord[],
    tiles: SphereTileKey[],
    centerTile: SphereTileKey,
  ) => {
    disposeActiveLocations?.();

    const group = new THREE.Group();
    const photos: THREE.Mesh<PhotoMarkerGeometry, PhotoMarkerMaterial>[] = [];

    const worldExtent = mergeTileExtents(
      ...tiles.map((tile) => tileExtent(tile.z, tile.x, tile.y)),
    );

    const waterDropTexture = textureLoader.load("/waterdrop.svg");
    const worldDemTexture = textureLoader.load(
      `${baseUrl}/raster/dem/${centerTile.z}/${centerTile.x}/${centerTile.y}/compose.png`,
    );

    journeyDay.photoIds.forEach((id) => {
      const photoRec = records.find((rec) => rec.id === id);
      if (!photoRec) {
        return;
      }

      const photo = new THREE.Mesh(
        new PhotoMarkerGeometry({
          rec: photoRec,
          size: 800,
          ratio: 1,
          worldExtent,
        }),
        new PhotoMarkerMaterial(textureLoader, {
          map: waterDropTexture,
          rec: photoRec,
          worldDemTexture,
          worldExtent,
        }),
      );

      group.add(photo);
      photos.push(photo);
    });

    scene.add(group);

    disposeActiveLocations = () => {
      scene.remove(group);

      for (const photo of photos) {
        photo.geometry.dispose();
        photo.material.dispose();
      }

      waterDropTexture.dispose();
      worldDemTexture.dispose();
      disposeActiveLocations = null;
    };
  };

  const dispose = () => {
    disposeActiveLocations?.();
  };

  return {
    showPhotosLocations,
    dispose,
  };
}
