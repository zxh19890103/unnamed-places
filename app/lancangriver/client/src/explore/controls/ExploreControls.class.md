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

## Issues

1. Pan does not work.
2. min/max distances should be changed on mode changes?
3. As the min/max distances are defined, `clampDistance` should be consider `mode`?
