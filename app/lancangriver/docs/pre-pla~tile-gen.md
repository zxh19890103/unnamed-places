## Read code, learn the current child tiles generating/rendering strategy.

## A new idea to create and render child tiles based on view distance.

For a tile `z11/x/y`, it's a base tile, where DEM tile exists.

The camera rays to the tile, and measures the distance between the camera and the center of the tile `O`, the distance is `D`.

zoom `11` is the min zoom level for this render system.

now we have `d0`, `d1`, `d2`, ..., where:

### in the case `D >= d0`, `Z` eqs `11`

one tile `z11/x/y`.

### in the case `d0 > D and D >= d1` , `Z` eqs `12`

we would split `z11/x/y` into `4`, but for this `4` child tiles, they share one `dem tile` which is the `z11/x/y@dem.png`, the 4 tiles would be rendered with 4 meshes in threejs.

So underhood, we need to split the `z11` dem tile into 4 parts for usage in the 4 child tiles.

### in the case `d1 > D and D >= d2` , `Z` eqs `13`.

we would split each `z12` tile into `4`, so we have `16` child tiles, but they share one `dem tile`, which is still the `z11` dem tile.

- ...

Following this logic.
