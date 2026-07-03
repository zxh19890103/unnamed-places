---
done: no
comment: tried, but not good enough, need to find a better way to render the low-altitude map style
---

# Sudden Idea

## Source Prompt

while zooming in to the extremely close to the ground, like below 300 meters, we will swith the tile material to another one, that's tiles being cleaned/prettified by sharpjs, and then load osm geojson to render the buildings/roads/rivers,. that would be another map style. my another idea is to load more detail of tiles to display on the screen. Satellite provide the enough high resolution.

## Intent

Introduce a low-altitude map mode that changes the visual language near the ground: either by switching to a cleaner tile style and overlaying OSM vector data for buildings, roads, and rivers, or by simply increasing satellite tile detail if imagery resolution is already sufficient.

## Proposed Shape

- Add a zoom/altitude threshold around the near-ground range (for example below 300m) that switches from the current satellite-first style to a distinct low-altitude style.
- In the low-altitude style, use sharpjs-processed tiles as a cleaner base layer and render OSM GeoJSON features on top for roads, buildings, and rivers.
- Keep an alternative path where the system instead requests higher-detail satellite tiles and avoids a style switch if imagery resolution alone can carry the view.

## Open Questions

- Should the low-altitude mode always switch styles, or only when satellite resolution drops below a quality threshold?
- Which OSM feature classes matter first: buildings, roads, rivers, landuse, or all of them together?
- Should sharpjs preprocessing happen offline/cache-time or on-demand at route time?

## Next Step

Compare the two approaches with a small prototype decision matrix: style switch plus OSM overlay versus higher-detail satellite-only rendering, then choose the simplest path that still looks crisp at low altitude.
