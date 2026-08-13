Here’s a prompt you can give to an AI coding assistant:

```text
Implement a Three.js road mesh generator that creates a road as a ribbon along a centerline curve.

Do NOT use THREE.ExtrudeGeometry or extrudePath, because strong curves can cause the cross-section to twist/screw.

Requirements:

1. Input:
   - A THREE.Curve or THREE.CatmullRomCurve3 representing the road centerline.
   - Road width.
   - Number of samples/segments.

2. Sample the centerline at regular intervals.
   For each sample:
   - Get the center position P.
   - Get the normalized tangent T.
   - Assume the road is on a horizontal XZ plane.
   - Calculate a stable horizontal perpendicular/side vector:

       side = normalize(new THREE.Vector3(-T.z, 0, T.x))

   - Calculate the left and right road vertices:

       left  = P + side * width / 2
       right = P - side * width / 2

3. Build a THREE.BufferGeometry from these vertices.

4. Connect consecutive left/right pairs into two triangles:

       left[i]      right[i]
          |           |
          |           |
       left[i+1]    right[i+1]

   Use indices:

       left[i], right[i], left[i+1]
       right[i], right[i+1], left[i+1]

5. Generate UV coordinates so that:
   - U runs across the road width from 0 to 1.
   - V runs along the road length.
   - V should preferably represent actual accumulated distance along the centerline rather than just the sample index, so road textures maintain a consistent scale.

6. Generate normals suitable for a flat horizontal road.

7. The implementation must remain stable on very strong curves.
   The road cross-section must never rotate/twist unexpectedly.

8. Make sampling sufficiently dense to prevent visible distortion on tight curves. Ideally provide a configurable segment count, and explain how adaptive sampling based on curvature could be added later.

9. Return a THREE.Mesh using BufferGeometry and a supplied THREE.Material.

10. Keep the implementation clean and reusable, for example:

       createRoadMesh(curve, width, segments, material)

Also explain why this approach is more stable than THREE.ExtrudeGeometry with extrudePath for a flat road, and include a small usage example with a strongly curved CatmullRomCurve3 to demonstrate that the road does not screw or twist.
```
