# Explore Contorls Explaination

This controls is special for controlling the earth exploration.

## Conceptions:

## Conceptions

1. **Position**: The world-space position of the camera.
2. **Altitude**: The vertical distance from the camera to the local Earth surface, in meters.
3. **Camera lat/lng**: The geographic coordinate beneath the camera, obtained by projecting the camera direction onto the Earth surface and converting that point to latitude/longitude.
4. **Target**: The world-space point that the camera is focused on.
5. **Distance**: The distance from the camera to the target, in meters.
6. **Radius**: The Earth radius, in meters.
7. **ModeSwapThresholds**: Two altitude thresholds are used to avoid mode flicker. When the camera altitude falls below the lower threshold, the controller enters `map` mode; when it rises above the upper threshold, it returns to `orbit` mode. The gap between the two thresholds creates hysteresis and keeps the interaction stable near the transition zone.
8. **min/max distances**: The distance range from camera to target.

## Interaction Modes

The controller supports two complementary viewing modes, each defined by how the camera is related to the Earth and the active ground point.

1. `orbit`
2. `map`

### Orbit mode

`orbit` mode is a global 3D view centered on a target point in space. The camera remains pointed toward the target while its spherical position around that target changes as the user rotates or zooms.

In this mode:

- the camera is defined by its distance from the target
- the target may remain fixed at the Earth center or at a chosen world focus
- rotation changes the azimuth and elevation around the target
- zoom changes the camera-target distance while preserving the viewing direction

This mode is best suited for exploring the Earth from a distance, where the user needs a conventional “orbit around the object” behavior.

### Map mode

`map` mode is a ground-anchored view. The camera is constrained to a local frame defined at a surface point, and the target is kept on or near the terrain surface. The user navigates as though they are moving across a map, while the camera remains visually attached to that local ground reference.

In this mode:

- the target moves across the Earth surface in the local ground plane
- the camera remains at a stable offset from that target
- zoom changes the camera height above the terrain
- pan moves the view along the local `north` / `east` directions

This mode is best suited for low-altitude inspection and map-like navigation, where the viewer should feel anchored to the ground instead of orbiting a floating world-space target.

### Ground-relative orientation

The local view direction at a surface point is defined in the ground CRS using the local tangent frame:

- `north`: direction toward increasing latitude
- `east`: direction toward increasing longitude
- `up`: local normal to the Earth surface

From this frame, the camera direction is described by:

1. `azimuth`: the horizontal angle, measured clockwise from north in the local ground plane
2. `altitude`: the vertical angle above the local horizon

Together, these define the heading and elevation of the view from the current ground point. In other words, the camera direction is expressed relative to the Earth surface rather than relative to the global world axes.

### How mode swaps

The controller uses a hysteresis threshold on camera altitude to switch between `orbit` and `map` modes.

- When the camera moves below the map threshold, the view transitions to `map`.
- When the camera moves above the orbit threshold, the view transitions back to `orbit`.
- The two thresholds are separated so the mode does not flicker near the boundary.

This keeps the interaction stable:

- low altitude + ground-relative motion = `map`
- high altitude + world-space orbit = `orbit`

## Interactions:

### Zoom

1. Hold Shift or Meta, then scroll.
2. `dx` is ignored.
3. `dy` controls zoom distance: positive means zoom out, negative means zoom in.
4. The camera moves toward or away from the target while preserving the current view center.

### Rotate

1. Scroll without Shift/Meta in `orbit` mode.
2. Use both `dx` and `dy` to compute a spherical rotation delta.
3. Adjust the camera’s azimuth and elevation around the target.

### Pan

1. Scroll without Shift/Meta in `map` mode.
2. Use `dx` and `dy` to translate the target in the local ground plane.
3. Keep the `camera-to-target` offset length and direction stable, so the view continues to look at the same surface-relative point.

## Zooming/Rotating speed curve

### Zooming:

Both `map` and `orbit` mode, zooming happens when user scroll the canvas with Shift/Meta pressed.

The input is `dx` and `dy`, both would be integer? and `abs(dx)` or `abs(dy)` would be `0, 1, 2, 3,..`, never be too large.

And the distance from camera to the focus place, the target, we name it `far`

Now, we define the `zooming speed`: a value, with unit of meters, being derived from `dy`. We only consider the scroll in vertical to the screen.

So we have:

```ts
function derive(dy: number, far: number) {
  const s = Math.sign(dy);
  const u = Math.min(Math.abs(dy) / 120, 1); // normalize wheel delta
  const curve = Math.log1p(8 * u) / Math.log1p(8); // 0..1, smooth and nonlinear
  const maxStep = 0.18 * far; // prevent giant jumps
  return s * Math.min(maxStep, far * curve);
}
```

We hope:

### Rotating

## Pointer Down -> Move = Rotate Camera self

### Pointer down and move delta y

delta y -> angle -> rotate camera around local X axe?

## Today

It's time to consider elevation.

1. Given a latlng, we will have a elevation min/max;
2. That means the earth surface will be lifted by `min` to `max`
3. It's does not affect the interactions under mode `orbit`
4. while in `map` mode, when users zooming and zooming in, to a point that is very close to the surface, it's under the ground, threejs renders total `nothing`
5. To fix this, we need adjust the something to make sure users can see the ground above the earth ground, instead of underneath it:

   - minDistance / maxDistance
   - live zoom compution
   - need to add a concept:
     ```
      distance from camera to ground,
      which differs from `alt` and `distance`
      we call it `height`?
     ```
   - place `target` on the ground, not on the point `sphere(latlng)`, that is `sphere(latlng, radius + elevation)`

   - zooming/panning sensivity should depend on `height` instead of `altitude`.

   - flyTo need to be updated
   - lookAtLatlng need to be updated
   - lookAtOrigin need to be updated

## Comming Features

1. [x] goto latlng
2. [x] restore evevation range!
3. [x] flyto, remain the orientation of camera.
4. [x] **camera can look around**

## Issues

1. [ ] after flyto or other actions, the orientation is not reconciled!

2. [ ] elevation needs to be detailed consideration! elevation applied, but switch to satellite, failed reset.

3. [ ] zooming / rotating speed has gaps! map-orbit/orbit-map

4. [ ] tiles are spliting toooooo small in foucs position!

5. [ ] roll/yaw/pitch the tiles' finding is not enough!
