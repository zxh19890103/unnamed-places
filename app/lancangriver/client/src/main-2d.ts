// 1. Initialize the map and set the view (e.g., Nantou, Taiwan)
const map = L.map("map").setView([23.69, 120.87], 10);
const serviceBaseUrl = "http://localhost:4050";

// 2. Add your custom tile server
// Replace the URL template with your specific server address
// {z} = zoom, {x} = column, {y} = row
L.tileLayer(`${serviceBaseUrl}/raster/satellite/{z}/{x}/{y}.jpeg`, {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

type LineCoordinates = [number, number][];

function extractLineStrings(geojson: unknown): LineCoordinates[] {
  const source = geojson as {
    type?: string;
    coordinates?: unknown;
    geometry?: { type?: string; coordinates?: unknown };
    features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
  };

  const geometries: Array<{ type?: string; coordinates?: unknown }> = [];

  if (source?.type === "FeatureCollection" && Array.isArray(source.features)) {
    for (const feature of source.features) {
      if (feature?.geometry) {
        geometries.push(feature.geometry);
      }
    }
  } else if (source?.type === "Feature" && source.geometry) {
    geometries.push(source.geometry);
  } else if (source?.type && source.coordinates) {
    geometries.push({ type: source.type, coordinates: source.coordinates });
  }

  const lineStrings: LineCoordinates[] = [];

  for (const geometry of geometries) {
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
      lineStrings.push(geometry.coordinates as LineCoordinates);
    }

    if (
      geometry.type === "MultiLineString" &&
      Array.isArray(geometry.coordinates)
    ) {
      for (const line of geometry.coordinates) {
        if (Array.isArray(line)) {
          lineStrings.push(line as LineCoordinates);
        }
      }
    }
  }

  return lineStrings;
}

async function addCenterlineLayer() {
  const response = await fetch(`${serviceBaseUrl}/geo/centerline`);
  if (!response.ok) {
    throw new Error(`centerline request failed: ${response.status}`);
  }

  const centerlineGeojson = (await response.json()) as unknown;
  const lineStrings = extractLineStrings(centerlineGeojson);

  if (lineStrings.length === 0) {
    return;
  }

  const layers = lineStrings.map((lineString) => {
    const latLngs = lineString.map(([lon, lat]) => [lat, lon]);

    return L.polyline(latLngs, {
      color: "#ff5f1f",
      weight: 3,
      opacity: 0.95,
    });
  });

  const centerlineLayerGroup = L.layerGroup(layers).addTo(map);
  const bounds = centerlineLayerGroup.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
}

void addCenterlineLayer().catch((error: unknown) => {
  console.error("Failed to add centerline layer", error);
});
