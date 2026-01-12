import * as THREE from "three";
import { type TileCRSProjection } from "@/geo/tile.js";
import type * as gj from "geojson";

// import Delaunator from "delaunator";
// import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { polygonContains } from "d3-polygon";

export class NaturalThingsCollection extends THREE.Group {
  readonly riverMaskTex: THREE.CanvasTexture;

  constructor(
    geojson: gj.FeatureCollection<gj.LineString>,
    projection: TileCRSProjection,
    tileSize: THREE.Vector2
  ) {
    super();

    const canvas = rasterPolygons(
      geojson.features,
      projection,
      tileSize,
      512,
      false
    );

    this.riverMaskTex = new THREE.CanvasTexture(canvas);
  }
}

function rasterPolygons(
  polygons: gj.Feature[],
  project: TileCRSProjection,
  tileSize: THREE.Vector2,
  dimension = 64,
  mount = true
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;

  const scaleX = dimension / tileSize.x;
  const scaleY = dimension / tileSize.y;

  const ctx2d = canvas.getContext("2d");
  ctx2d.fillStyle = "#000000";
  ctx2d.fillRect(0, 0, dimension, dimension);

  ctx2d.fillStyle = "white";

  let positions: gj.Position[];
  let size = 0;
  let coord: gj.Position;
  let x: number;
  let y: number;
  let cursor = 0;

  const line = () => {
    coord = positions[cursor];
    [x, y] = project(coord);

    y = tileSize.y - y;

    x *= scaleX;
    y *= scaleY;
  };

  const render = () => {
    for (const { geometry, properties } of polygons) {
      if (properties.natural !== "water") continue;
      if (geometry.type !== "Polygon") {
        continue;
      }

      positions = geometry.coordinates[0];
      size = positions.length;

      ctx2d.beginPath();

      cursor = 0;

      line();
      ctx2d.moveTo(x, y);

      cursor = 1;
      for (; cursor < size; cursor++) {
        line();
        ctx2d.lineTo(x, y);
      }

      ctx2d.closePath();
      ctx2d.fill();
    }
  };

  render();

  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 999;
  `;

  if (mount) {
    document.body.appendChild(canvas);
  }

  return canvas;
}

/*
function renderTriangles() {
  // remove the last two positions;
  const size = positions.length;
  const coordinates: [number, number][] = [];
  const coords = new Float32Array(2 * size);

  cursor = 0;

  for (let i = 0; i < size; i++) {
    line();
    coords[2 * i] = x;
    coords[2 * i + 1] = y;
    coordinates.push([x, y]);
    cursor++;
  }

  const delaunator = new Delaunator(coords);

  const { triangles, halfedges, coords: dcoords } = delaunator;

  ctx2d.strokeStyle = "#ffffff";

  ctx2d.beginPath();
  for (let e = 0; e < halfedges.length; e++) {
    const twin = halfedges[e];
    if (twin > e) {
      const ti = triangles[e];
      const tj = triangles[twin];

      const from = [dcoords[ti * 2], dcoords[ti * 2 + 1]] as [number, number];
      const to = [dcoords[tj * 2], dcoords[tj * 2 + 1]] as [number, number];

      ctx2d.moveTo(from[0], from[1]);
      ctx2d.lineTo(to[0], to[1]);
    }
  }
  ctx2d.stroke();
}

*/

/**
 * Calculates the circumcenter of a triangle in the Delaunator array
 * @param {number} i - The index of the triangle (triangleIndex)
 * @param {Float64Array} points - The flat points array [x0, y0, x1, y1...]
 * @param {Uint32Array} triangles - The d.triangles array from Delaunator
 */
function getCircumcenter(i, points, triangles) {
  const t0 = triangles[i * 3] * 2;
  const t1 = triangles[i * 3 + 1] * 2;
  const t2 = triangles[i * 3 + 2] * 2;

  const ax = points[t0];
  const ay = points[t0 + 1];
  const bx = points[t1];
  const by = points[t1 + 1];
  const cx = points[t2];
  const cy = points[t2 + 1];

  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;

  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);

  const x = ax + (ey * bl - dy * cl) * d;
  const y = ay + (dx * cl - ex * bl) * d;

  return { x, y };
}