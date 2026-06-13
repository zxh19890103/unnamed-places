## General Ideas

### Goals

Render Lancang River from Origin to The End.

Data:

- OSM data: River/Road/Buildings
- Google Satellites' Images: 1024 Tile At Zoom 11
- Terrain Data: SRTM 90m DEM, From OpenTopography, I have access key.

### My Plans (Need Modification)

- Only Threejs for Rendering.
- For Data Downloading the Storing,
  Python for downloading all the three kinds of data
- Storing: For Images, Store them in disk with good name convention. For OSM data, store them in a database, maybe PostGIS. For DEM data, store them in disk as well, with good name convention, It's must be mutual with the image tiles, so that I can easily query the DEM data when I want to render a specific tile.

### Where to run

- Docker.
- Qgis.

### Questions

- How to load the River data in streaming way?
