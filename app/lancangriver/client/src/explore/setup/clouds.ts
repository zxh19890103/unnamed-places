import * as THREE from "three";
import { LatLng } from "../../calc/types";
import { CloudGeometry } from "../geometries/CloudGeometry.class";
import { CloudMaterial } from "../materials/CloudMaterial.class";

export type GroundOrbitCloudsController = {
  replaceCloudsAtTarget: (params: {
    latlng: LatLng;
    orbitTarget: THREE.Vector3;
    cameraDistanceMeters: number;
    viewportHeight: number;
  }) => void;
  clear: () => void;
  syncViewportHeight: (height: number) => void;
  dispose: () => void;
};

export function createGroundOrbitCloudsController(params: {
  scene: THREE.Scene;
  cloudAtlasTexture: THREE.Texture;
}): GroundOrbitCloudsController {
  const { scene, cloudAtlasTexture } = params;
  let groundOrbitClouds: THREE.Points<CloudGeometry, CloudMaterial> | null =
    null;

  const clear = () => {
    if (!groundOrbitClouds) {
      return;
    }

    scene.remove(groundOrbitClouds);
    groundOrbitClouds.geometry.dispose();
    groundOrbitClouds.material.dispose();
    groundOrbitClouds = null;
  };

  const replaceCloudsAtTarget = ({
    latlng,
    orbitTarget,
    cameraDistanceMeters,
    viewportHeight,
  }: {
    latlng: LatLng;
    orbitTarget: THREE.Vector3;
    cameraDistanceMeters: number;
    viewportHeight: number;
  }) => {
    clear();

    const cloudRadius = 10 * cameraDistanceMeters;
    const cloudGeometry = new CloudGeometry({
      latlng,
      radius: cloudRadius,
      count: 100,
      maxAltitudeDeg: 60,
      bandWidth: 0,
    });
    const cloudMaterial = new CloudMaterial({
      color: "#ffffff",
      size: 600,
      opacity: 0.55,
      softness: 0.6,
      sizeAttenuation: false,
      viewportHeight,
      atlasTexture: cloudAtlasTexture,
      atlasGrid: 4,
    });

    groundOrbitClouds = new THREE.Points(cloudGeometry, cloudMaterial);
    groundOrbitClouds.position.copy(orbitTarget);
    scene.add(groundOrbitClouds);
  };

  const syncViewportHeight = (height: number) => {
    if (!groundOrbitClouds) {
      return;
    }

    groundOrbitClouds.material.uniforms.uViewportHeight.value = Math.max(
      1,
      height,
    );
  };

  const dispose = () => {
    clear();
  };

  return {
    replaceCloudsAtTarget,
    clear,
    syncViewportHeight,
    dispose,
  };
}
