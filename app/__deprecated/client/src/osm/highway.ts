import * as THREE from "three";
import { type DemInformation, type TileCRSProjection } from "@/geo/tile.js";
import type * as gj from "geojson";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ThreeSetup } from "@/geo/setup.js";

export class HighwaysCollection extends THREE.Group {
  readonly bwMaskTex: THREE.CanvasTexture;

  constructor(
    geojson: gj.FeatureCollection,
    projection: TileCRSProjection,
    tileSize: THREE.Vector2,
    demInformation: DemInformation,
    world: ThreeSetup,
  ) {
    super();

    const features = geojson.features.filter(({ geometry, properties }) => {
      return properties.highway !== undefined && geometry.type === "LineString";
    }) as gj.Feature<gj.LineString>[];

    const geometries: THREE.BufferGeometry[] = [];

    features.forEach((feature) => {
      if (feature.geometry.type !== "LineString") {
        return;
      }

      const width = getWidth(feature.properties.highway);

      const points = feature.geometry.coordinates.map((coord) => {
        const pt = projection(coord);
        return new THREE.Vector3(pt[0], pt[1], 0);
      });

      const curve = new THREE.CatmullRomCurve3(points);
      const shape = new THREE.Shape();

      shape.moveTo(0, -width / 2);
      shape.lineTo(0, width / 2);

      const Pa = new THREE.Vector3();
      const Pb = new THREE.Vector3();
      const Pc = new THREE.Vector3();
      const Pd = new THREE.Vector3();

      const setP = (vertices: number[], i: number, P: THREE.Vector3) => {
        const i3 = i * 3;
        P.set(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
      };

      let Uad = 0;
      let Ubc = 0;

      const QuadUvs: number[] = [];
      const picRatio = 680 / 460;
      const riverWidth = 1.5 * 1e3; // on horizon, 1: 1000;
      const v_per_meter = 10; // picRatio / riverWidth; // V varys with the distance of flow.

      const extrGeom = new THREE.ExtrudeGeometry(shape, {
        depth: 1,
        steps: Math.ceil(curve.getLength() / 10),
        extrudePath: curve,
        bevelEnabled: false,
        UVGenerator: {
          generateTopUV: (geometry, vertices, indexA, indexB, indexC) => {
            return [
              new THREE.Vector2(0, 0),
              new THREE.Vector2(0, 0),
              new THREE.Vector2(0, 0),
            ];
          },
          generateSideWallUV(
            geometry,
            vertices,
            indexA,
            indexB,
            indexC,
            indexD,
          ) {
            setP(vertices, indexA, Pa); // bottom left
            setP(vertices, indexB, Pb); // bottom right
            setP(vertices, indexC, Pc); // top right
            setP(vertices, indexD, Pd); // top left

            const Dad = Pa.distanceTo(Pd);
            const Dbc = Pc.distanceTo(Pb);
            const Davg = 0.5 * (Dad + Dbc);

            const Dad_0 = Davg;
            const Dbc_0 = Davg;

            const uvs = [
              new THREE.Vector2(0, Uad), // a
              new THREE.Vector2(1, Ubc), // b
              new THREE.Vector2(1, (Ubc += Dbc_0 * v_per_meter)), // c
              new THREE.Vector2(0, (Uad += Dad_0 * v_per_meter)), // d
            ];

            return uvs;
          },
        },
      });

      const attriPos = extrGeom.attributes.position;
      for (let i = 0; i < attriPos.count; i++) {
        QuadUvs.push(
          attriPos.getX(i) / tileSize.x,
          attriPos.getY(i) / tileSize.y,
        );
      }

      extrGeom.setAttribute(
        "uv1",
        new THREE.Float32BufferAttribute(QuadUvs, 2),
      );

      geometries.push(extrGeom);
    });

    const canvasElement = rasterBWMask(
      features,
      projection,
      tileSize,
      512,
      false,
    );

    this.bwMaskTex = new THREE.CanvasTexture(canvasElement);

    const extrGeoms = mergeGeometries(geometries, false);

    const roadSurface = world.textureLoader.load(
      "/public/assets/city-roads/png",
    );

    roadSurface.wrapS = THREE.RepeatWrapping;
    roadSurface.wrapT = THREE.RepeatWrapping;

    const betterUi = new THREE.Mesh(
      extrGeoms,
      new THREE.ShaderMaterial({
        uniforms: {
          map: {
            value: roadSurface,
          },
          roadColor: { value: new THREE.Color("#6E6E6E") },
          displacementMap: { value: demInformation.texture },
          displacementBias: {
            value: demInformation.elevation.minElevation + 5,
          },
          displacementScale: { value: demInformation.elevation.span },
        },
        vertexShader: /*glsl */ `
          attribute vec2 uv1;
          
          uniform sampler2D displacementMap;
          uniform float displacementBias;
          uniform float displacementScale;

          varying vec2 vUv;

          void main() {
            vec3 pos = position.xyz;

            float h = texture2D(displacementMap, uv1).r;
            pos.z += displacementBias + displacementScale * h;

            vUv = uv;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
          `,
        fragmentShader: `
          uniform vec3 roadColor;

          void main() {
            gl_FragColor = vec4(roadColor, 1.0);
          }
          `,
      }),
    );

    this.add(betterUi);
  }
}

const highwayWidthConfig = {
  motorway: {
    approx_meters: 30,
    lanes_typical: "2-4 per direction + shoulders",
  },
  trunk: { approx_meters: 18, lanes_typical: "1-2 per direction" },
  primary: { approx_meters: 12, lanes_typical: "1-2 total" },
  secondary: { approx_meters: 9, lanes_typical: "1 total" },
  tertiary: { approx_meters: 7, lanes_typical: "1 total" },
  residential: { approx_meters: 6, lanes_typical: "shared" },
  path: { approx_meters: 1.5, lanes_typical: "none (pedestrian)" },
};

const getWidth = (highway) => {
  return highwayWidthConfig[highway]?.approx_meters ?? 3;
};

function rasterBWMask(
  polygons: gj.Feature<gj.LineString>[],
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
  const scale = scaleX;

  const ctx2d = canvas.getContext("2d");
  ctx2d.fillStyle = "#000000";
  ctx2d.fillRect(0, 0, dimension, dimension);

  ctx2d.fillStyle = "white";
  ctx2d.strokeStyle = "white";

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
      positions = geometry.coordinates;
      size = positions.length;

      ctx2d.beginPath();
      ctx2d.lineWidth = 2 * scale * getWidth(properties.highway);

      cursor = 0;

      line();
      ctx2d.moveTo(x, y);

      cursor = 1;
      for (; cursor < size; cursor++) {
        line();
        ctx2d.lineTo(x, y);
      }

      ctx2d.stroke();
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
