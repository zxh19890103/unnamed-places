import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export type TileCoords = {
  z: number;
  x: number;
  y: number;
};

export type TileVectorLayer = {
  name: string;
  features: GeoJSON.Feature[];
};

export type TileVector = {
  coords: TileCoords;
  layers: TileVectorLayer[];
};

export async function fetchTileVector(
  url: string,
  coords: TileCoords,
): Promise<TileVector> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/x-protobuf",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch tile ${coords.z}/${coords.x}/${coords.y}: ${response.status} ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const vectorTile = new VectorTile(new PbfReader(bytes));

  return {
    coords,
    layers: Object.entries(vectorTile.layers).map(([name, layer]) => ({
      name,
      features: Array.from({ length: layer.length }, (_, index) =>
        layer.feature(index).toGeoJSON(coords.x, coords.y, coords.z),
      ),
    })),
  };
}
