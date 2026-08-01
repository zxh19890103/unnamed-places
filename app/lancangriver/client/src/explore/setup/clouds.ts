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
  syncCloudsAtTarget: (params: {
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
  const CLOUD_RADIUS_MULTIPLIER = 10;
  const REBUILD_LAT_LNG_THRESHOLD_DEG = 0.2;
  const REBUILD_RADIUS_RATIO_THRESHOLD = 0.35;

  let groundOrbitClouds: THREE.Points<CloudGeometry, CloudMaterial> | null =
    null;
  let lastLatlng: LatLng | null = null;
  let lastCloudRadius = 0;

  const normalizedLngDelta = (a: number, b: number) => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  };

  const shouldRebuildGeometry = (nextLatlng: LatLng, nextRadius: number) => {
    if (!lastLatlng || lastCloudRadius <= 0) {
      return true;
    }

    const latDelta = Math.abs(nextLatlng.lat - lastLatlng.lat);
    const lngDelta = normalizedLngDelta(nextLatlng.lng, lastLatlng.lng);
    const radiusDeltaRatio =
      Math.abs(nextRadius - lastCloudRadius) / Math.max(1, lastCloudRadius);

    return (
      latDelta > REBUILD_LAT_LNG_THRESHOLD_DEG ||
      lngDelta > REBUILD_LAT_LNG_THRESHOLD_DEG ||
      radiusDeltaRatio > REBUILD_RADIUS_RATIO_THRESHOLD
    );
  };

  const clear = () => {
    if (!groundOrbitClouds) {
      return;
    }

    scene.remove(groundOrbitClouds);
    groundOrbitClouds.geometry.dispose();
    groundOrbitClouds.material.dispose();
    groundOrbitClouds = null;
    lastLatlng = null;
    lastCloudRadius = 0;
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

    const cloudRadius =
      CLOUD_RADIUS_MULTIPLIER * Math.max(1, cameraDistanceMeters);
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
    groundOrbitClouds.scale.setScalar(1);
    lastLatlng = { ...latlng };
    lastCloudRadius = cloudRadius;
    scene.add(groundOrbitClouds);
  };

  const syncCloudsAtTarget = ({
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
    const nextCloudRadius =
      CLOUD_RADIUS_MULTIPLIER * Math.max(1, cameraDistanceMeters);

    if (!groundOrbitClouds) {
      replaceCloudsAtTarget({
        latlng,
        orbitTarget,
        cameraDistanceMeters,
        viewportHeight,
      });
      return;
    }

    if (shouldRebuildGeometry(latlng, nextCloudRadius)) {
      replaceCloudsAtTarget({
        latlng,
        orbitTarget,
        cameraDistanceMeters,
        viewportHeight,
      });
      return;
    }

    groundOrbitClouds.position.copy(orbitTarget);
    groundOrbitClouds.scale.setScalar(
      nextCloudRadius / Math.max(1, lastCloudRadius),
    );
    groundOrbitClouds.material.uniforms.uViewportHeight.value = Math.max(
      1,
      viewportHeight,
    );
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
    syncCloudsAtTarget,
    clear,
    syncViewportHeight,
    dispose,
  };
}
