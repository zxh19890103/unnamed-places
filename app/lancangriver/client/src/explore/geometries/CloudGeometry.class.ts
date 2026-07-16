import * as THREE from "three";
import { getLocalBasisAtPoint } from "../../calc/sphere";
import { LatLng } from "../../calc/types";
import { latlngToSphere } from "../../experiments/sphere-zoom/core";

type Parameters = {
  /**
   * the current center on the earth's surface.
   */
  latlng: LatLng;
  /**
   * meters, the nearest point from the person's position (origin at latlng)
   */
  radius: number;
  /**
   * how many clouds are there?
   */
  count: number;
  /**
   * degrees, vertical fov above the horizon [0, 90].
   */
  maxAltitudeDeg: number;
  /**
   * for each cloud point, r = radius + Math.random() * bandWidth
   */
  bandWidth: number;
};

export class CloudGeometry extends THREE.BufferGeometry {
  constructor(params: Parameters) {
    super();

    const { latlng, radius, count, maxAltitudeDeg, bandWidth } = params;
    const vertexCount = Math.max(0, Math.floor(count));

    if (vertexCount === 0) {
      this.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      this.setAttribute("spriteIndex", new THREE.Float32BufferAttribute([], 1));
      return;
    }

    const personPosition = latlngToSphere(latlng.lat, latlng.lng);
    const { up, east, north } = getLocalBasisAtPoint(
      new THREE.Vector3(personPosition.x, personPosition.y, personPosition.z),
    );

    const maxAltitudeRad = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp(maxAltitudeDeg, 0, 90),
    );
    const maxSinAltitude = Math.sin(maxAltitudeRad);
    const minRadius = Math.max(0, radius);
    const radialBand = Math.max(0, bandWidth);
    const data = new Float32Array(vertexCount * 3);
    const spriteIndices = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i += 1) {
      const azimuth = Math.random() * Math.PI * 2;
      // Uniformly sample the vertical FOV by solid angle for altitude in [0, maxAltitude].
      const sinAltitude = Math.random() * maxSinAltitude;
      const cosAltitude = Math.sqrt(Math.max(0, 1 - sinAltitude * sinAltitude));

      const horizontal = new THREE.Vector3()
        .copy(east)
        .multiplyScalar(Math.cos(azimuth))
        .addScaledVector(north, Math.sin(azimuth));

      const dir = new THREE.Vector3()
        .copy(horizontal)
        .multiplyScalar(cosAltitude)
        .addScaledVector(up, sinAltitude)
        .normalize();

      const r = minRadius + Math.random() * radialBand;
      data[i * 3] = dir.x * r;
      data[i * 3 + 1] = dir.y * r;
      data[i * 3 + 2] = dir.z * r;
      spriteIndices[i] = Math.floor(Math.random() * 16);
    }

    this.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
    this.setAttribute(
      "spriteIndex",
      new THREE.Float32BufferAttribute(spriteIndices, 1),
    );

    this.computeBoundingSphere();
  }
}
