import * as THREE from "three";
import * as SunCalc from "suncalc";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { getLocalBasisAtPoint } from "@/calc/sphere";
import {
  START_CENTER_LAT,
  START_CENTER_LON,
  EARTH_RADIUS,
} from "@/calc/constants";
import { getDateForLocalTimeAtLatLng } from "@/calc/timezone";
import { LatLng } from "@/calc/types";
import { latlngToSphere } from "@/_3dtiles";

export const SKY_COLOR = new THREE.Color("#ffffff");
export const FOG_COLOR = new THREE.Color("#ffffff");

const SKY_SCALE_MULTIPLIER = 8;

function computeSunDirectionForLocation(
  date: Date,
  latitude: number,
  longitude: number,
) {
  const observerSurfacePointRaw = latlngToSphere(latitude, longitude);
  const observerSurfacePoint = new THREE.Vector3(
    observerSurfacePointRaw.x,
    observerSurfacePointRaw.y,
    observerSurfacePointRaw.z,
  );
  const { up, east, north } = getLocalBasisAtPoint(observerSurfacePoint);
  const { azimuth, altitude } = SunCalc.getPosition(date, latitude, longitude);
  const azimuthRad = THREE.MathUtils.degToRad(azimuth);
  const altitudeRad = THREE.MathUtils.degToRad(altitude);

  const horizontal = north
    .clone()
    .multiplyScalar(Math.cos(azimuthRad))
    .add(east.clone().multiplyScalar(Math.sin(azimuthRad)));

  return horizontal
    .multiplyScalar(Math.cos(altitudeRad))
    .add(up.multiplyScalar(Math.sin(altitudeRad)))
    .normalize();
}

export function getDefaultCenterLatlng(): LatLng {
  return {
    lat: START_CENTER_LAT,
    lng: START_CENTER_LON,
  };
}

function getLatlngNow(latlng: LatLng) {
  const localTime = `12:32`;
  return getDateForLocalTimeAtLatLng(latlng, localTime);
}

export function createSkyRig({
  scene,
  camera,
}: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}) {
  function createEarthSpace() {}

  let createEarthSurfaceSky_dispose: VoidFunction = null;

  function createEarthSurfaceSky(latlng: LatLng) {
    createEarthSurfaceSky_dispose?.();

    const sky = new Sky();
    scene.add(sky);

    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const orbitCenter = latlngToSphere(latlng.lat, latlng.lng);

    const scale = cameraDistanceMeters * SKY_SCALE_MULTIPLIER;
    sky.scale.setScalar(scale);
    sky.position.copy(orbitCenter);
    sky.rotation.set(0, 0, 0);

    const initialCenter = getDefaultCenterLatlng();
    const sunDirection = computeSunDirectionForLocation(
      getLatlngNow(initialCenter),
      initialCenter.lat,
      initialCenter.lng,
    );

    const skyUniforms = sky.material.uniforms;
    skyUniforms.turbidity.value = 0.01;
    skyUniforms.rayleigh.value = 0.2;
    skyUniforms.mieCoefficient.value = 0.00015;
    skyUniforms.mieDirectionalG.value = 0.05;
    skyUniforms.sunPosition.value.copy(sunDirection);
    skyUniforms.up.value.set(0, 1, 0);

    const nextSunDirection = computeSunDirectionForLocation(
      getLatlngNow(latlng),
      latlng.lat,
      latlng.lng,
    );

    skyUniforms.sunPosition.value.copy(nextSunDirection);
    skyUniforms.up.value.copy(orbitCenter).normalize();

    const sunLight = new THREE.DirectionalLight("#fff2d6", 0.45);
    sunLight.position.copy(sunDirection).multiplyScalar(scale * 0.25);
    scene.add(sunLight);

    createEarthSurfaceSky_dispose = () => {
      scene.remove(sky);
      scene.remove(sunLight);

      createEarthSurfaceSky_dispose = null;
    };

    return createEarthSurfaceSky_dispose;
  }

  return {
    dispose: () => {
      createEarthSurfaceSky_dispose?.();
    },
    createEarthSpace,
    createEarthSurfaceSky,
  };
}
