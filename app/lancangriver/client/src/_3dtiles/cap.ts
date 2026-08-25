import { type Vector3Tuple } from 'three';

// Helper vector functions
const vec3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (v) => Math.hypot(v[0], v[1], v[2]),
  normalize: (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l === 0 ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l];
  },
};

/**
 * Calculates the shortest distance between a 3D Point P and a Sphere Cap.
 * @param {number} R - Radius of the sphere
 * @param {Array<number>} C - Center of the sphere [x, y, z]
 * @param {Array<number>} N - Center axis vector of the cap (must be normalized) [x, y, z]
 * @param {number} halfCapAngle - The cap opening half-angle in radians
 * @param {Array<number>} P - The 3D point to check [x, y, z]
 * @returns {number} The shortest Euclidean distance
 */
export function shortestDistanceToCap(
  R: number,
  C: Vector3Tuple,
  N: Vector3Tuple,
  halfCapAngle: number,
  P: Vector3Tuple,
) {
  // 1. Vector from sphere center to target point P
  const v = vec3.sub(P, C);
  const d = vec3.len(v);

  // Edge case: P is exactly at the sphere center
  if (d === 0) return R;

  // 2. Direction unit vector from center to P
  const vHat = vec3.normalize(v);

  // 3. Find the angle between the cap axis N and vHat
  // cos(theta) = dot(vHat, N)
  const cosTheta = Math.max(-1, Math.min(1, vec3.dot(vHat, N)));
  const theta = Math.acos(cosTheta);

  // CASE 1: The point directly projects onto the surface of the cap
  if (theta <= halfCapAngle) {
    return Math.abs(d - R);
  }

  // CASE 2: The closest point is on the circular rim/boundary of the cap
  // Find the component of vHat orthogonal to N to get the steering direction
  const nProj = vec3.scale(N, cosTheta);
  const ortho = vec3.sub(vHat, nProj);
  const orthoDir = vec3.normalize(ortho);

  // Construct the vector pointing from C to the closest edge point on the cap
  // closestEdgeDir = N * cos(halfCapAngle) + orthoDir * sin(halfCapAngle)
  const closestEdgeDir = vec3.add(
    vec3.scale(N, Math.cos(halfCapAngle)),
    vec3.scale(orthoDir, Math.sin(halfCapAngle)),
  );

  // Scale by radius to get the actual 3D position of the closest point on the rim
  const closestPointOnCap = vec3.add(C, vec3.scale(closestEdgeDir, R));

  // Return Euclidean distance from P to that boundary point
  return vec3.len(vec3.sub(P, closestPointOnCap));
}
