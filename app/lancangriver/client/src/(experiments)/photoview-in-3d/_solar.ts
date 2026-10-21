import * as THREE from 'three';

export const DEFAULT_DAYTIME = '12:40';

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

/**
 * Solar Elevation Color Spline
 * Keyframes mapping solar elevation angle (degrees) to realistic atmospheric colors:
 * - sunColor: Direct sunlight color illuminating terrain, water, and clouds
 * - sunAmbient: Ambient sky/indirect fill in valleys and non-sunlit slopes
 * - coronaColor: Golden outer glow for the sun disc
 * - flareColor: Atmospheric scattering aura around the sun
 * - skyZenith: Upper atmosphere dome zenith color
 * - skyHorizon: Lower atmosphere horizon color
 * - skyHaze: Soft ambient haze rim at the ground edge
 */
interface SolarColorKeyframe {
  elevation: number;
  sunColor: THREE.Color;
  sunAmbient: THREE.Color;
  coronaColor: THREE.Color;
  flareColor: THREE.Color;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyHaze: THREE.Color;
}

const SOLAR_COLOR_KEYFRAMES: SolarColorKeyframe[] = [
  {
    elevation: 0, // Sunset / Sunrise at horizon
    sunColor: new THREE.Color('#ff4d17'),
    sunAmbient: new THREE.Color('#384260'),
    coronaColor: new THREE.Color('#ff7b29'),
    flareColor: new THREE.Color('#d92b00'),
    skyZenith: new THREE.Color('#1e2942'),
    skyHorizon: new THREE.Color('#ff6e38'),
    skyHaze: new THREE.Color('#ffb05c'),
  },
  {
    elevation: 6, // Golden hour (early sunset / dawn)
    sunColor: new THREE.Color('#ff8533'),
    sunAmbient: new THREE.Color('#4e6080'),
    coronaColor: new THREE.Color('#ffad42'),
    flareColor: new THREE.Color('#ff5511'),
    skyZenith: new THREE.Color('#324b6e'),
    skyHorizon: new THREE.Color('#ff9c54'),
    skyHaze: new THREE.Color('#ffd085'),
  },
  {
    elevation: 16, // Low afternoon / early morning sun
    sunColor: new THREE.Color('#ffc066'),
    sunAmbient: new THREE.Color('#6b84a6'),
    coronaColor: new THREE.Color('#ffd175'),
    flareColor: new THREE.Color('#ff8426'),
    skyZenith: new THREE.Color('#507fae'),
    skyHorizon: new THREE.Color('#fbe0ba'),
    skyHaze: new THREE.Color('#ffffff'),
  },
  {
    elevation: 32, // Mid afternoon / mid morning
    sunColor: new THREE.Color('#fff0d4'),
    sunAmbient: new THREE.Color('#7e9cb8'),
    coronaColor: new THREE.Color('#ffe299'),
    flareColor: new THREE.Color('#ffa84d'),
    skyZenith: new THREE.Color('#6ba4db'),
    skyHorizon: new THREE.Color('#ebf5ff'),
    skyHaze: new THREE.Color('#ffffff'),
  },
  {
    elevation: 60, // High noon zenith
    sunColor: new THREE.Color('#fffdf5'),
    sunAmbient: new THREE.Color('#8ab4d8'),
    coronaColor: new THREE.Color('#fff4cc'),
    flareColor: new THREE.Color('#ffc266'),
    skyZenith: new THREE.Color('#7ab6ea'),
    skyHorizon: new THREE.Color('#edf7ff'),
    skyHaze: new THREE.Color('#ffffff'),
  },
];

function computeSolarColors(elevationDeg: number): {
  sunColor: THREE.Color;
  sunAmbient: THREE.Color;
  coronaColor: THREE.Color;
  flareColor: THREE.Color;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyHaze: THREE.Color;
} {
  const elev = Math.max(0, elevationDeg);

  // Find adjacent keyframes
  if (elev <= SOLAR_COLOR_KEYFRAMES[0].elevation) {
    const kf = SOLAR_COLOR_KEYFRAMES[0];
    return {
      sunColor: kf.sunColor.clone(),
      sunAmbient: kf.sunAmbient.clone(),
      coronaColor: kf.coronaColor.clone(),
      flareColor: kf.flareColor.clone(),
      skyZenith: kf.skyZenith.clone(),
      skyHorizon: kf.skyHorizon.clone(),
      skyHaze: kf.skyHaze.clone(),
    };
  }

  const lastIndex = SOLAR_COLOR_KEYFRAMES.length - 1;
  if (elev >= SOLAR_COLOR_KEYFRAMES[lastIndex].elevation) {
    const kf = SOLAR_COLOR_KEYFRAMES[lastIndex];
    return {
      sunColor: kf.sunColor.clone(),
      sunAmbient: kf.sunAmbient.clone(),
      coronaColor: kf.coronaColor.clone(),
      flareColor: kf.flareColor.clone(),
      skyZenith: kf.skyZenith.clone(),
      skyHorizon: kf.skyHorizon.clone(),
      skyHaze: kf.skyHaze.clone(),
    };
  }

  let i = 0;
  while (i < lastIndex && SOLAR_COLOR_KEYFRAMES[i + 1].elevation < elev) {
    i += 1;
  }

  const kf0 = SOLAR_COLOR_KEYFRAMES[i];
  const kf1 = SOLAR_COLOR_KEYFRAMES[i + 1];
  const t = (elev - kf0.elevation) / (kf1.elevation - kf0.elevation);
  const smoothT = t * t * (3 - 2 * t);

  return {
    sunColor: kf0.sunColor.clone().lerp(kf1.sunColor, smoothT),
    sunAmbient: kf0.sunAmbient.clone().lerp(kf1.sunAmbient, smoothT),
    coronaColor: kf0.coronaColor.clone().lerp(kf1.coronaColor, smoothT),
    flareColor: kf0.flareColor.clone().lerp(kf1.flareColor, smoothT),
    skyZenith: kf0.skyZenith.clone().lerp(kf1.skyZenith, smoothT),
    skyHorizon: kf0.skyHorizon.clone().lerp(kf1.skyHorizon, smoothT),
    skyHaze: kf0.skyHaze.clone().lerp(kf1.skyHaze, smoothT),
  };
}

function computeSunDirectionFromAngles(elevation: number, azimuth: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);

  const sun = new THREE.Vector3();
  sun.setFromSphericalCoords(1, phi, theta);
  return sun.normalize();
}

const initialAngles = parseDaytime(DEFAULT_DAYTIME);
const initialColors = computeSolarColors(initialAngles.elevation);

const sharedSunDirection = computeSunDirectionFromAngles(
  initialAngles.elevation,
  initialAngles.azimuth,
);
const sharedSunColor = initialColors.sunColor;
const sharedSunAmbient = initialColors.sunAmbient;
const sharedCoronaColor = initialColors.coronaColor;
const sharedFlareColor = initialColors.flareColor;
const sharedSkyZenith = initialColors.skyZenith;
const sharedSkyHorizon = initialColors.skyHorizon;
const sharedSkyHaze = initialColors.skyHaze;

export const SolarUniforms = {
  sunDirection: { value: sharedSunDirection },
  uSunDirection: { value: sharedSunDirection },
  sunPosition: { value: sharedSunDirection },
  sunColor: { value: sharedSunColor },
  sunAmbient: { value: sharedSunAmbient },
  coronaColor: { value: sharedCoronaColor },
  flareColor: { value: sharedFlareColor },
  skyZenith: { value: sharedSkyZenith },
  skyHorizon: { value: sharedSkyHorizon },
  skyHaze: { value: sharedSkyHaze },
};

export function setSolarDaytime(timeStr: string): THREE.Vector3 {
  const { elevation, azimuth } = parseDaytime(timeStr);
  const updatedDir = computeSunDirectionFromAngles(elevation, azimuth);
  const colors = computeSolarColors(elevation);

  sharedSunDirection.copy(updatedDir);
  sharedSunColor.copy(colors.sunColor);
  sharedSunAmbient.copy(colors.sunAmbient);
  sharedCoronaColor.copy(colors.coronaColor);
  sharedFlareColor.copy(colors.flareColor);
  sharedSkyZenith.copy(colors.skyZenith);
  sharedSkyHorizon.copy(colors.skyHorizon);
  sharedSkyHaze.copy(colors.skyHaze);

  return sharedSunDirection;
}

export function getSolarDirection(): THREE.Vector3 {
  return sharedSunDirection;
}

export { SolarMesh, type SolarMeshOptions } from './Sky.js';
