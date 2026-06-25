import * as THREE from "three";
import { type DemInformation, type TileCRSProjection } from "@/geo/tile.js";
import type * as gj from "geojson";
import type { ThreeSetup } from "@/geo/setup.js";

// import Delaunator from "delaunator";
// import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { polygonContains } from "d3-polygon";

export class NaturalThingsCollection extends THREE.Group {
  readonly riverMaskTex: THREE.CanvasTexture;

  constructor(
    geojson: gj.FeatureCollection,
    projection: TileCRSProjection,
    tileSize: THREE.Vector2,
    tileGrid: THREE.Vector2,
    demInformation: DemInformation,
    textureLoader: THREE.TextureLoader,
    __world: ThreeSetup,
  ) {
    super();

    const canvas = rasterPolygons(
      geojson.features.filter(({ properties, geometry }) => {
        console.log(properties, geometry.type);
        return (
          (properties.natural === "water" ||
            properties.natural === "wetland") &&
          (properties.water === "river" ||
            properties.water === "pond" ||
            properties.water === "lake") &&
          (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
        );
      }) as unknown as any,
      projection,
      tileSize,
      512,
      false,
    );

    this.riverMaskTex = new THREE.CanvasTexture(canvas);

    const pmremGenerator = new THREE.PMREMGenerator(__world.renderer);
    const environmentTarget = pmremGenerator.fromScene(__world.world);
    __world.world.environment = environmentTarget.texture;
    __world.world.environment.wrapS = THREE.RepeatWrapping;
    __world.world.environment.wrapT = THREE.RepeatWrapping;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(tileSize.x, tileSize.y, tileGrid.x, tileGrid.y),
      new THREE.MeshStandardMaterial({
        color: 0xeeeeee, // Base silver/grey
        metalness: 0.9,
        roughness: 0.7,
        displacementMap: demInformation.texture,
        displacementBias: demInformation.elevation.minElevation + 5,
        displacementScale: demInformation.elevation.span,
        normalMap: textureLoader.load(
          "/public/assets/waternormals.jpg",
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(40, 40);
          },
        ),
        // envMap: environmentTarget.texture, // Sky reflection
        transparent: true,
        opacity: 1,
        alphaTest: 0.5,
        alphaMap: this.riverMaskTex,
      }),
    );

    // const waterMaterial = water.material;
    // __world.animate((_, elapsed) => {
    //   // Very subtle movement for a "calm" silvering look
    //   waterMaterial.displacementScale =
    //     Math.sin(elapsed) * demInformation.elevation.span;
    //   // waterMaterial.normalMap.offset.y += 0.01 * Math.sin(elapsed);
    // });

    // water.position.set(0, 0, demInformation.elevation.minElevation + 30);
    this.add(water);
  }
}

function rasterPolygons(
  polygons: gj.Feature<gj.Polygon | gj.MultiPolygon>[],
  project: TileCRSProjection,
  tileSize: THREE.Vector2,
  dimension = 64,
  mount = true,
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

  const renderOnePolygon = (_positions: gj.Position[]) => {

    positions = _positions;

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
  };

  const render = () => {
    for (const { geometry, properties } of polygons) {
      if (geometry.type === "Polygon") {
        renderOnePolygon(geometry.coordinates[0]);
      } else {
        for (const positions of geometry.coordinates) {
          renderOnePolygon(positions[0]);
        }
      }
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
