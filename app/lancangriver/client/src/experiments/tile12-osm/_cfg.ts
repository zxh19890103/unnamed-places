import { BASE_URL } from "../../calc/constants";
import { TileCoords } from "../../osm/tiles";

export const shaderGlslSegments = {
  decodeTerrariumHeight: `
  float decodeTerrariumHeight(vec4 rgb) {
    float elevation = (rgb.r * 255.0 * 256.0 + rgb.g * 255.0 + (rgb.b * 255.0) / 256.0) - 32768.0;
    return elevation;
  }
  `,
};

export const uniformSettings = {
  getTerrariumInfoUrl: (tile: TileCoords) => {
    return `${BASE_URL}/raster/dem/${tile.z}/${tile.x}/${tile.y}.png`;
  },
};
