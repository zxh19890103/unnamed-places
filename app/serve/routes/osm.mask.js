import fabric from "fabric/node";
import fs from "node:fs";
import { join } from "node:path";
import _config from "../_config.js";
import { createLatlngToTileCoordProjector } from "../geo/tile.js";
import sharp from "sharp";

export const route = /^osm-mask/;
export const enabled = true;
export const pathmatch = "/osm-mask/:z/:x/:y";

import { pipeline } from "stream/promises";

async function streamToBuffer(readable) {
  const chunks = [];

  await pipeline(readable, async function* (source) {
    for await (const chunk of source) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  });

  return Buffer.concat(chunks);
}

/**
 * @type {__types__.Handler<__types__.WithXYZ<{}>, { extents: string }>}
 */
export const handler = (req, res, url, params, search) => {
  const extents = search.extents.split(",").map(Number);
  console.log("extents=", extents);

  res.writeHead(200, {
    "Content-Type": "image/png",
    // Optional: Enable CORS so THREE.js can load it from different domains
    "Access-Control-Allow-Origin": "*",
  });

  const canvas = new fabric.StaticCanvas(null, {
    width: 512,
    height: 512,
    renderOnAddRemove: false,
    backgroundColor: "#000000",
    enableRetinaScaling: false, // usually not needed for masks
  });

  generateGeoJSONMaskStream(
    join(
      _config.paths.osmdata,
      `./highway-${params.z}-${params.x}-${params.y}.geojson`,
    ),
    {
      xyz: params,
      extents,
      noPolygon: true,
      polygonFillColor: "#f1911a",
      backgroundColor: "#000000",
      lineColor: "#00ff00",
      lineWidth: 1,
      canvasWidth: 512,
      canvasHeight: 512,
    },
    () => canvas,
    false,
  )
    .then(() => {
      return generateGeoJSONMaskStream(
        join(
          _config.paths.osmdata,
          `./natural-${params.z}-${params.x}-${params.y}.geojson`,
        ),
        {
          xyz: params,
          extents,
          noPolygon: false,
          polygonFillColor: "#ff0000",
          backgroundColor: "#000000",
          lineColor: "#000000",
          lineWidth: 0,
          canvasWidth: 512,
          canvasHeight: 512,
        },
        () => canvas,
        true,
      );
    })
    .then(
      () => {
        canvas
          .createPNGStream({
            compressionLevel: 6,
          })
          .pipe(res);
      },
      (err) => {
        console.error("Error generating mask:", err);
        res.end();
      },
    );
};

// mask-generator-fabric-objects.js
// Uses fabric.Path / fabric.Polygon objects + createPNGStream

// ─── Meter extents ───────────────────────────────────────────────
function collectMeterExtents(geojson, projector) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  const update = (lng, lat) => {
    const [mx, my] = projector([lng, lat]);
    minX = Math.min(minX, mx);
    maxX = Math.max(maxX, mx);
    minY = Math.min(minY, my);
    maxY = Math.max(maxY, my);
  };

  geojson.features?.forEach((f) => {
    const g = f.geometry;
    if (!g?.coordinates) return;
    const visit = (coords) => {
      if (Array.isArray(coords[0])) coords.forEach(visit);
      else update(...coords);
    };
    visit(g.coordinates);
  });

  if (maxX <= minX || maxY <= minY) throw new Error("Empty/degenerate bounds");
  return { minX, maxX, minY, maxY };
}

function meterToPixel(mx, my, meterBBox, canvasWidth, canvasHeight) {
  const nx = mx / meterBBox.x;
  const ny = my / meterBBox.y;
  return {
    x: Math.round(nx * canvasWidth),
    y: Math.round((1 - ny) * canvasHeight), // north-up
  };
}

function createPathData(coords, projector, meterBBox, w, h, close = false) {
  const parts = [];
  coords.forEach(([lon, lat], i) => {
    const [mx, my] = projector([lon, lat]);
    const { x, y } = meterToPixel(mx, my, meterBBox, w, h);
    parts.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
  });
  if (close) parts.push("Z");
  return parts.join(" ");
}

export async function generateGeoJSONMaskStream(
  geojsonPath,
  options = {},
  getCanvas,
  render = true,
) {
  const {
    xyz = { x: 0, y: 0, z: 0 },
    canvasWidth = 2048,
    canvasHeight = 2048,
    extents = [1, 1],
    lineWidth = 25,
    noPolygon = false,
    lineColor = "#ffffff",
    polygonFillColor = "#ffffff",
    backgroundColor = "#000000",
    compressionLevel = 6,
  } = options;

  const geojson = JSON.parse(await fs.promises.readFile(geojsonPath, "utf8"));
  if (geojson.type !== "FeatureCollection")
    throw new Error("Expected FeatureCollection");

  const projector = createLatlngToTileCoordProjector(xyz);
  const meterBBox = { x: extents[0], y: extents[1] }; // collectMeterExtents(geojson, projector);

  const canvas = getCanvas();

  // ─── Add objects ───────────────────────────────────────────────
  geojson.features.forEach((f) => {
    const geom = f.geometry;
    if (!geom) return;

    switch (geom.type) {
      case "LineString": {
        const d = createPathData(
          geom.coordinates,
          projector,
          meterBBox,
          canvasWidth,
          canvasHeight,
        );
        canvas.add(
          new fabric.Path(d, {
            fill: "none",
            stroke: lineColor,
            strokeWidth: lineWidth,
            strokeLineCap: "round",
            strokeLineJoin: "round",
            selectable: false,
            evented: false,
            objectCaching: true, // helps on repeated renders
          }),
        );
        break;
      }

      case "MultiLineString": {
        geom.coordinates.forEach((lineCoords) => {
          const d = createPathData(
            lineCoords,
            projector,
            meterBBox,
            canvasWidth,
            canvasHeight,
          );
          canvas.add(
            new fabric.Path(d, {
              fill: "none",
              stroke: lineColor,
              strokeWidth: lineWidth,
              strokeLineCap: "round",
              strokeLineJoin: "round",
              selectable: false,
              evented: false,
              objectCaching: true,
            }),
          );
        });
        break;
      }

      case "Polygon": {
        if (noPolygon) break;

        let d = createPathData(
          geom.coordinates[0],
          projector,
          meterBBox,
          canvasWidth,
          canvasHeight,
          true,
        );
        for (let i = 1; i < geom.coordinates.length; i++) {
          d +=
            " " +
            createPathData(
              geom.coordinates[i],
              projector,
              meterBBox,
              canvasWidth,
              canvasHeight,
              true,
            );
        }
        canvas.add(
          new fabric.Path(d, {
            fill: polygonFillColor,
            stroke: "none",
            fillRule: geom.coordinates.length > 1 ? "evenodd" : "nonzero",
            selectable: false,
            evented: false,
            objectCaching: true,
          }),
        );
        break;
      }

      case "MultiPolygon": {
        if (noPolygon) break;

        geom.coordinates.forEach((polyRings) => {
          let d = createPathData(
            polyRings[0],
            projector,
            meterBBox,
            canvasWidth,
            canvasHeight,
            true,
          );
          for (let i = 1; i < polyRings.length; i++) {
            d +=
              " " +
              createPathData(
                polyRings[i],
                projector,
                meterBBox,
                canvasWidth,
                canvasHeight,
                true,
              );
          }
          canvas.add(
            new fabric.Path(d, {
              fill: polygonFillColor,
              stroke: "none",
              fillRule: polyRings.length > 1 ? "evenodd" : "nonzero",
              selectable: false,
              evented: false,
              objectCaching: true,
            }),
          );
        });
        break;
      }

      // Point / MultiPoint could be added as fabric.Circle later if needed
    }
  });

  if (render) {
    canvas.renderAll();
  }
}
