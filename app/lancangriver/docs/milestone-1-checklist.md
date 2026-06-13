# Milestone 1 Checklist

- [ ] PostGIS container is running and healthy
- [ ] `DATABASE_URL` is set for the service
- [ ] `OPENTOPOGRAPHY_API_KEY` is set for DEM fetching
- [ ] `/health` responds with 200
- [ ] `/vector?bbox=...` responds with FeatureCollection
- [ ] `/raster/satellite/:z/:x/:y` responds with cached/downloaded metadata
- [ ] `/raster/dem/:z/:x/:y` responds with gtiff/png metadata
- [ ] Client bootstrap shows diagnostics status string without hard crash
- [ ] `bash scripts/smoke.sh` prints `smoke-ok`
