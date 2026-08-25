import * as THREE from 'three';

export type CameraFit = {
  target: THREE.Vector3;
  distance: number;
  radius: number;
};

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  padding = 1.2,
): CameraFit {
  const bounds = new THREE.Box3().setFromObject(object);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center;
  const radius = Math.max(sphere.radius, 1);
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = (radius * padding) / Math.sin(limitingHalfFov);

  const direction = camera.position.clone().sub(target);
  if (direction.lengthSq() === 0) {
    direction.set(1, 1, 1);
  }
  direction.normalize();
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.near = Math.max(0.1, distance - radius * padding * 1.5);
  camera.far = Math.max(camera.near + 1, distance + radius * padding * 3);
  camera.updateProjectionMatrix();

  return { target, distance, radius };
}

export function fitCameraToTileCenter(
  camera: THREE.PerspectiveCamera,
  widthMeters: number,
  heightMeters: number,
  padding = 1.2,
  target = new THREE.Vector3(0, 0, 0),
): CameraFit {
  const radius = Math.max(Math.hypot(widthMeters, heightMeters) * 0.5, 1);
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = (radius * padding) / Math.sin(limitingHalfFov);

  const direction = camera.position.clone().sub(target);
  if (direction.lengthSq() === 0) {
    direction.set(1, 1, 1);
  }
  direction.normalize();
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.near = 0.1; // Math.max(0.1, distance - radius * padding * 1.5);
  camera.far = Math.max(camera.near + 1, distance + radius * padding * 3);
  camera.updateProjectionMatrix();

  return { target, distance, radius };
}
