import fabric from "fabric/node";
import fs from "node:fs";
import { join } from "node:path";
import _config from "../_config.js";
import { createLatlngToTileCoordProjector } from "../geo/tile.js";

export const route = /^osm-mask/;
export const enabled = true;
export const pathmatch = "/osm-mask/:z/:x/:y";

/**
 * @type {__types__.Handler<__types__.WithXYZ<{}>>}
 */
export const handler = (req, res, url, params, search) => {
  res.writeHead(200, {
    "Content-Type": "image/png",
    // Optional: Enable CORS so THREE.js can load it from different domains
    "Access-Control-Allow-Origin": "*",
  });

  generateGeoJSONMaskBuffer(
    join(
      _config.paths.osmdata,
      `./highway-${params.z}-${params.x}-${params.y}.geojson`,
    ),
    {
      xyz: params,
      polygonFillColor: "#fe01a0",
      backgroundColor: "#faf20e",
      lineWidth: 2,
      canvasWidth: 512,
      canvasHeight: 512,
    },
  ).then(
    (buffer) => {
      buffer.on("end", () => {
        // canvas.clear();
        // canvas.dispose();
      });

      buffer.pipe(res);
    },
    (err_) => {
      console.log(err_);
    },
  );
};

// ────────────────────────────────────────────────
//           NEW — collect meter-space extents
// ────────────────────────────────────────────────

function collectMeterExtents(geojson, projector) {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  const update = (lng, lat) => {
    const [mx, my] = projector([lng, lat]);
    minX = Math.min(minX, mx);
    maxX = Math.max(maxX, mx);
    minY = Math.min(minY, my);
    maxY = Math.max(maxY, my);
  };

  const traverse = (coords) => {
    coords.forEach(([lon, lat]) => update(lon, lat));
  };

  geojson.features?.forEach((f) => {
    const g = f.geometry;
    if (!g?.coordinates) return;

    switch (g.type) {
      case "Point":
        update(...g.coordinates);
        break;
      case "LineString":
      case "MultiPoint":
        g.coordinates.forEach((c) => update(...c));
        break;
      case "Polygon":
        g.coordinates.forEach((ring) => traverse(ring));
        break;
      case "MultiLineString":
        g.coordinates.forEach((line) => traverse(line));
        break;
      case "MultiPolygon":
        g.coordinates.forEach((poly) => poly.forEach((ring) => traverse(ring)));
        break;
    }
  });

  // Prevent zero-size
  if (maxX <= minX || maxY <= minY) {
    throw new Error("All features collapsed to point or empty");
  }

  return { minX, maxX, minY, maxY };
}

function meterToCanvas([mx, my], meterBBox, canvasWidth, canvasHeight) {
  // Normalize [minX..maxX] → [0..canvasWidth]
  const nx = (mx - meterBBox.minX) / (meterBBox.maxX - meterBBox.minX);
  const ny = (my - meterBBox.minY) / (meterBBox.maxY - meterBBox.minY);

  // Canvas Y is inverted (0 = top)
  const cx = Math.round(nx * canvasWidth);
  const cy = Math.round((1 - ny) * canvasHeight); // flip Y

  return { x: cx, y: cy };
}

function createPathString(
  coords,
  projector,
  meterBBox,
  canvasWidth,
  canvasHeight,
  close = false,
) {
  let path = "";
  coords.forEach(([lon, lat], i) => {
    const [mx, my] = projector([lon, lat]);
    const { x, y } = meterToCanvas(
      [mx, my],
      meterBBox,
      canvasWidth,
      canvasHeight,
    );
    path += i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
  });
  if (close) path += "Z ";
  return path;
}

/**
 * Main function — now using your tile projector
 */
export async function generateGeoJSONMaskBuffer(geojsonPath, options = {}) {
  const {
    xyz = { x: 0, y: 0, z: 0 }, // ← pass your tile coordinate here!
    canvasWidth = 2048,
    canvasHeight = 2048,
    lineWidth = 25,
    lineColor = "#ffffff",
    polygonFillColor = "#ffffff",
    backgroundColor = "#000000",
  } = options;

  const geojsonStr = await fs.readFileSync(geojsonPath, "utf8");
  const geojson = JSON.parse(geojsonStr);

  if (geojson.type !== "FeatureCollection") {
    throw new Error("Expected FeatureCollection");
  }

  // ─── Your projection ───────────────────────────────────────
  const projector = createLatlngToTileCoordProjector(xyz);

  // Compute meter-space extents once (fast)
  const meterBBox = collectMeterExtents(geojson, projector);

  // Fabric canvas
  const canvas = new fabric.StaticCanvas(null, {
    width: canvasWidth,
    height: canvasHeight,
    renderOnAddRemove: false,
    backgroundColor,
  });

  // ─── Render each feature ───────────────────────────────────
  for (const feature of geojson.features || []) {
    const geom = feature.geometry;
    if (!geom) continue;

    switch (geom.type) {
      case "LineString": {
        const pathStr = createPathString(
          geom.coordinates,
          projector,
          meterBBox,
          canvasWidth,
          canvasHeight,
        );
        canvas.add(
          new fabric.Path(pathStr, {
            fill: "none",
            stroke: lineColor,
            strokeWidth: lineWidth,
            strokeLineCap: "round",
            strokeLineJoin: "round",
            selectable: false,
            evented: false,
          }),
        );
        break;
      }

      case "MultiLineString": {
        geom.coordinates.forEach((lineCoords) => {
          const pathStr = createPathString(
            lineCoords,
            projector,
            meterBBox,
            canvasWidth,
            canvasHeight,
          );
          canvas.add(
            new fabric.Path(pathStr, {
              fill: "none",
              stroke: lineColor,
              strokeWidth: lineWidth,
              strokeLineCap: "round",
              strokeLineJoin: "round",
              selectable: false,
              evented: false,
            }),
          );
        });
        break;
      }

      case "Polygon": {
        let pathStr = createPathString(
          geom.coordinates[0],
          projector,
          meterBBox,
          canvasWidth,
          canvasHeight,
          true,
        );
        for (let i = 1; i < geom.coordinates.length; i++) {
          pathStr += createPathString(
            geom.coordinates[i],
            projector,
            meterBBox,
            canvasWidth,
            canvasHeight,
            true,
          );
        }
        canvas.add(
          new fabric.Path(pathStr, {
            fill: polygonFillColor,
            stroke: "none",
            fillRule: geom.coordinates.length > 1 ? "evenodd" : "nonzero",
            selectable: false,
            evented: false,
          }),
        );
        break;
      }

      case "MultiPolygon": {
        geom.coordinates.forEach((polyRings) => {
          let pathStr = createPathString(
            polyRings[0],
            projector,
            meterBBox,
            canvasWidth,
            canvasHeight,
            true,
          );
          for (let i = 1; i < polyRings.length; i++) {
            pathStr += createPathString(
              polyRings[i],
              projector,
              meterBBox,
              canvasWidth,
              canvasHeight,
              true,
            );
          }
          canvas.add(
            new fabric.Path(pathStr, {
              fill: polygonFillColor,
              stroke: "none",
              fillRule: polyRings.length > 1 ? "evenodd" : "nonzero",
              selectable: false,
              evented: false,
            }),
          );
        });
        break;
      }

      // Add Point/MultiPoint as small circles if you want later
    }
  }

  canvas.renderAll();

  return canvas.createPNGStream({});
}
