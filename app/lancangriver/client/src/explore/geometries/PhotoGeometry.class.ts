import * as THREE from "three";
import { getLocalBasisAtPoint, latlngToSphere } from "../../calc/sphere";
import { PhotoRecord } from "../../photos/types";
import { WorldExtent } from "../../calc/types";

type Parameters = {
  worldExtent: WorldExtent;
  rec: PhotoRecord;
  /** width on local X (east), in world units */
  size?: number;
  /** width / height where height is local Z (north) */
  ratio?: number;
};

export class PhotoGeometry extends THREE.BufferGeometry {
  constructor(params: Parameters) {
    super();

    const { size = 180, ratio = 4 / 3, worldExtent } = params;

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error("PhotoGeometry size must be a finite number > 0");
    }

    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new Error("PhotoGeometry ratio must be a finite number > 0");
    }

    const anchorLng = worldExtent.west + worldExtent.lngSpan * 0.5;
    const anchor = latlngToSphere(worldExtent.north, anchorLng);
    const center = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    const { up, east, north } = getLocalBasisAtPoint(center);

    const halfX = size * 0.5;
    const sizeY = size / ratio;
    const south = north.clone().multiplyScalar(-1);

    const v0 = center.clone().addScaledVector(east, -halfX);
    const v1 = center.clone().addScaledVector(east, halfX);
    const v2 = v1.clone().addScaledVector(up, sizeY);
    const v3 = v0.clone().addScaledVector(up, sizeY);

    const positions = new Float32Array([
      v0.x,
      v0.y,
      v0.z,
      v1.x,
      v1.y,
      v1.z,
      v2.x,
      v2.y,
      v2.z,
      v3.x,
      v3.y,
      v3.z,
    ]);

    const normals = new Float32Array([
      south.x,
      south.y,
      south.z,
      south.x,
      south.y,
      south.z,
      south.x,
      south.y,
      south.z,
      south.x,
      south.y,
      south.z,
    ]);

    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    this.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    this.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.setIndex(new THREE.BufferAttribute(indices, 1));

    this.computeBoundingSphere();
  }
}
