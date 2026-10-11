import * as THREE from 'three';

export const DEFAULT_DAYTIME = '15:30';

function parseDaytime(timeStr: string): { elevation: number; azimuth: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const decimalHours = hours + (minutes || 0) / 60;
  const solarNoon = 12;
  const hoursFromNoon = decimalHours - solarNoon;
  const maxElevation = 70;
  const elevation = Math.max(0, maxElevation - Math.abs(hoursFromNoon) * 9);
  const azimuth = 180 + hoursFromNoon * 15;
  return { elevation, azimuth };
}

function computeSunDirection(timeStr: string): THREE.Vector3 {
  const { elevation, azimuth } = parseDaytime(timeStr);
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);

  const sun = new THREE.Vector3();
  sun.setFromSphericalCoords(1, phi, theta);
  return sun.normalize();
}

const sharedSunDirection = computeSunDirection(DEFAULT_DAYTIME);
const sharedSunColor = new THREE.Color('#fffbf0');

export const SolarUniforms = {
  sunDirection: { value: sharedSunDirection },
  uSunDirection: { value: sharedSunDirection },
  sunPosition: { value: sharedSunDirection },
  sunColor: { value: sharedSunColor },
};

export function setSolarDaytime(timeStr: string): THREE.Vector3 {
  const updated = computeSunDirection(timeStr);
  sharedSunDirection.copy(updated);
  return sharedSunDirection;
}

export function getSolarDirection(): THREE.Vector3 {
  return sharedSunDirection;
}

export { SolarMesh, type SolarMeshOptions } from './Sky.js';
