import * as THREE from "three";
import * as SunCalc from "suncalc";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import {
  EARTH_RADIUS,
  getLocalBasisAtPoint,
  latlngToSphere,
  sphereToLatlng,
} from "../../calc/sphere";
import { START_CENTER_LAT, START_CENTER_LON } from "../../calc/constants";
import { getDateForLocalTimeAtLatLng } from "../../calc/timezone";
import { LatLng } from "../../calc/types";
import { SkyRig, SkySyncParams } from "./types";

export const SKY_DISTANCE = EARTH_RADIUS * 8;
export const SKY_COLOR = new THREE.Color("#ffffff");
export const FOG_COLOR = new THREE.Color("#ffffff");
const SKY_SCALE_MULTIPLIER = 8;
const SKY_MIN_SCALE = EARTH_RADIUS * 1.5;
const SKY_MAX_SCALE = EARTH_RADIUS * 12;

function computeSunDirectionForLocation(
  date: Date,
  latitude: number,
  longitude: number,
) {
  const observerSurfacePointRaw = latlngToSphere(
    latitude,
    longitude,
    EARTH_RADIUS,
  );
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

function getDefaultCenterLatlng(): LatLng {
  const latlngExpr = `40.746,14.498`;
  const [lat, lng] = latlngExpr.split(",").map((seg) => Number(seg));

  return {
    lat: lat ?? START_CENTER_LAT,
    lng: lng ?? START_CENTER_LON,
  };
}

function getLatlngNow(latlng: LatLng) {
  const localTime = `07:32`;
  return getDateForLocalTimeAtLatLng(latlng, localTime);
}

export function createSkyRig(scene: THREE.Scene): SkyRig {
  const sky = new Sky();
  sky.scale.setScalar(SKY_DISTANCE);
  scene.add(sky);

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

  const sunLight = new THREE.DirectionalLight("#fff2d6", 0.45);
  sunLight.position.copy(sunDirection).multiplyScalar(SKY_DISTANCE * 0.25);
  scene.add(sunLight);

  const syncSkyWithCamera = ({
    orbitCenter,
    cameraDistanceMeters,
  }: SkySyncParams) => {
    const scale = THREE.MathUtils.clamp(
      cameraDistanceMeters * SKY_SCALE_MULTIPLIER,
      SKY_MIN_SCALE,
      SKY_MAX_SCALE,
    );

    sky.scale.setScalar(scale);
    sky.position.copy(orbitCenter);
    sky.rotation.set(0, 0, 0);

    const latlng = sphereToLatlng(orbitCenter.x, orbitCenter.y, orbitCenter.z);
    const nextSunDirection = computeSunDirectionForLocation(
      getLatlngNow(latlng),
      latlng.lat,
      latlng.lng,
    );

    skyUniforms.sunPosition.value.copy(nextSunDirection);
    skyUniforms.up.value.copy(orbitCenter).normalize();
  };

  return {
    sky,
    sunLight,
    initialCenter,
    syncSkyWithCamera,
  };
}
