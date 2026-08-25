import { Vector3 } from 'three';

export function getLocalBasisAtPoint(target: Vector3) {
  const up = target.clone().normalize();
  const worldNorth = new Vector3(0, 1, 0);
  let east = worldNorth.clone().cross(up);

  if (east.lengthSq() < 1e-10) {
    east = new Vector3(1, 0, 0).cross(up);
  }

  east.normalize();
  const north = up.clone().cross(east).normalize();
  return { up, east, north };
}
