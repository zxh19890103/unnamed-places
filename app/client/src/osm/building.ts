import * as THREE from "three";
import {
  type DemInformation,
  type TileCRSProjection,
  type TileElevation,
} from "@/geo/tile.js";
import type * as gj from "geojson";
import type { ThreeSetup } from "@/geo/setup.js";

import { Text } from "troika-three-text";

export class BuildingsCollection extends THREE.Group {
  constructor(
    geojson: gj.FeatureCollection,
    projection: TileCRSProjection,
    tileSize: THREE.Vector2,
    tileGrid: THREE.Vector2,
    threeSetup: ThreeSetup,
    deminformation: DemInformation
  ) {
    super();

    const onOneComputed = (pos: THREE.Vector3, properties) => {
      // const text = new Text();

      // text.text = properties.name ?? "unnamed";
      // text.fontSize = 50;
      // text.color = 0xea910f;
      // text.position.copy(pos);

      console.log(properties.name);

      // this.add(text);
    };

    const ui = buildBuildings(
      geojson,
      tileSize,
      tileGrid,
      threeSetup.textureLoader,
      projection,
      deminformation,
      threeSetup,
      onOneComputed
    );

    this.add(ui);
  }
}

// polygon
function buildBuildings(
  geojson: gj.FeatureCollection,
  tileSize: THREE.Vector2,
  tileGRid: THREE.Vector2,
  textLoader: THREE.TextureLoader,
  projectFn: TileCRSProjection,
  deminformation: DemInformation,
  __world: ThreeSetup,
  onOneComputed
) {
  const geodat: GeometryAttriData = {
    tileSize: { x: tileSize.x, y: tileSize.y },
    tileGrid: { x: tileGRid.x, y: tileGRid.y },
    offset: 0,
    group: [],
    groupIndex: 0,
    position: [],
    indices: [],
    uv: [],
    uv1: [],
    color: [],
    normal: [],
  };

  const getHeight = (properties) => {
    if (Object.hasOwn(properties, "height")) {
      return Number(properties.height);
    } else if (Object.hasOwn(properties, "building:levels")) {
      return Number(properties["building:levels"]) * 6;
    } else if (properties.building === "apartments") {
      return 90;
    } else if (properties.building === "commercial") {
      return 120;
    }
    return 34;
  };

  let count = 0;
  for (const { geometry, properties } of geojson.features) {
    if (properties.building === undefined) continue;

    if (geometry.type === "Polygon") {
      const lnglats = geometry.coordinates[0];
      const h = getHeight(properties);
      count++;
      makeOneBuilding(lnglats, h, projectFn, geodat, properties, onOneComputed);
    }
  }

  console.log("buildings count", count);

  const surface = textLoader.load("/public/assets/city-buildings.modern.png");
  surface.channel = 1;
  // surface.wrapS = THREE.RepeatWrapping;
  // surface.wrapT = THREE.RepeatWrapping;
  surface.minFilter = THREE.LinearMipMapNearestFilter;
  surface.magFilter = THREE.LinearFilter;

  /**
   * to use atlas texture,
   * 1. tell the shader the offset and scale
   * 2. but, all vertex are together, u must group them by buildings.
   * 3. how to group?
   */
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(geodat.position, 3)
  );
  geometry.setAttribute(
    "aBuildingType",
    new THREE.Float32BufferAttribute(geodat.group, 1)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(geodat.uv, 2));
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(geodat.uv1, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(geodat.color, 3)
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(geodat.normal, 3)
  );

  geometry.setIndex(geodat.indices);

  const mapSubdivisions = new Float32Array(16 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const scale = new THREE.Vector2(0.25, 0.25);
      const offset = new THREE.Vector2(0.25 * x, 0.25 * y);
      const basis = 4 * (y * 4 + x);
      mapSubdivisions[basis] = scale.x;
      mapSubdivisions[basis + 1] = scale.y;
      mapSubdivisions[basis + 2] = offset.x;
      mapSubdivisions[basis + 3] = offset.y;
    }
  }

  const material2 = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: surface },
      mapSubdivisions: { value: mapSubdivisions },
      displacementMap: { value: deminformation.texture },
      displacementScale: { value: deminformation.elevation.span },
      displacementBias: { value: deminformation.elevation.minElevation + 5 },

      ambLightColor: {
        value: __world.ambientLight.color,
      },
      ambLightIntensity: {
        value: __world.ambientLight.intensity,
      },
      dirLightColor: {
        value: __world.directionalLight.color,
      },
      dirLightDir: {
        value: __world.directionalLight.position.clone().normalize(),
      },
      dirLightIntensity: {
        value: __world.directionalLight.intensity,
      },
    },
    wireframe: false,
    vertexShader: `
      attribute vec2 uv1;
      attribute vec3 color;
      attribute float aBuildingType;

      uniform sampler2D displacementMap;
      uniform float displacementScale;
      uniform float displacementBias;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vBuildingType;
      varying vec3 vNormal;

      void main() {
        vec3 pos = position.xyz;
        
        vUv = uv1;
        vColor = color;
        vNormal = mat3(modelMatrix) * normal;

        vBuildingType = aBuildingType;
        float h = texture2D(displacementMap, uv).r;
        pos.z += displacementBias + displacementScale * h;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
      `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec4 mapSubdivisions[16];

      uniform vec3 ambLightColor;
      uniform float ambLightIntensity;
      uniform vec3 dirLightColor;
      uniform float dirLightIntensity;
      uniform vec3 dirLightDir;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vBuildingType;
      varying vec3 vNormal;

      void main() {
        vec2 uv = fract(vUv);

        vec4 offsetScale = mapSubdivisions[int(vBuildingType)];
        vec2 scale = offsetScale.rg;
        vec2 offset = offsetScale.ba;
        
        uv *= scale;
        uv += offset;

        vec3 baseColor = texture2D(map, uv).rgb;
        vec3 emissiveColor = vColor * 0.1;
        baseColor += emissiveColor;

        float diffuse = max(dot(vNormal, dirLightDir), 0.0);
        vec3 lighting = ambLightColor.rgb * ambLightIntensity + (dirLightColor.rgb * diffuse) * dirLightIntensity;


        gl_FragColor = vec4(baseColor * lighting, 1.0);
      }
      `,
  });

  const mesh0 = new THREE.Mesh(geometry, material2);
  mesh0.frustumCulled = false;

  return mesh0;
}

function makeOneBuilding(
  lnglats: gj.Position[],
  height: number,
  project: TileCRSProjection,
  geoAttriData: GeometryAttriData,
  properties,
  onComputed: (xyz: THREE.Vector3, properties) => void
) {
  const pts = lnglats.map(project);
  const {
    group,
    tileSize,
    tileGrid,
    position,
    color,
    indices,
    normal,
    uv,
    uv1,
  } = geoAttriData;

  const uniformColor = new THREE.Color(
    BuildingColor[properties.building] ?? BuildingColor.apartments
  );

  const uniformType =
    BuildingType[properties.building] ?? BuildingType.unclassified;

  const metersToUvFactor = 0.1; //
  let offset = geoAttriData.offset;
  let cursor = 0;
  let x = 0;
  let y = 0;
  let u = 0;
  let Pt = null;

  const vertexA = new THREE.Vector3();
  const vertexB = new THREE.Vector3();
  const vertexC = new THREE.Vector3();
  const vertexD = new THREE.Vector3();

  const createOneVertex = (i: number, h: number = 0, vertex: THREE.Vector3) => {
    Pt = pts[i];

    x = Pt[0];
    y = Pt[1];

    position.push(x, y, h); // 0, 2
    group.push(uniformType);
    color.push(uniformColor.r, uniformColor.g, uniformColor.b);
    uv.push(x / tileSize.x, y / tileSize.y);

    vertex.set(x, y, h);
  };

  /**
   * d---c
   * |   |
   * b---a
   */
  const createFace = (indexA: number, indexB: number) => {
    createOneVertex(indexB, 0, vertexB);
    createOneVertex(indexA, 0, vertexA);
    createOneVertex(indexA, height, vertexC);
    createOneVertex(indexB, height, vertexD);

    vertexB.sub(vertexA);
    vertexC.sub(vertexA);

    vertexB.cross(vertexC).normalize();

    normal.push(vertexB.x, vertexB.y, vertexB.z);
    normal.push(vertexB.x, vertexB.y, vertexB.z);
    normal.push(vertexB.x, vertexB.y, vertexB.z);
    normal.push(vertexB.x, vertexB.y, vertexB.z);

    uv1.push(0, 0);
    uv1.push(u, 0);
    uv1.push(u, height * metersToUvFactor);
    uv1.push(0, height * metersToUvFactor);

    indices.push(
      offset,
      offset + 3,
      offset + 2,
      offset,
      offset + 2,
      offset + 1
    );

    offset += 4;
  };

  /**
   * to applied lights
   * vertex cannot be shared,
   * so we will create more vertex now.
   */
  const max = pts.length;
  for (cursor = 1; cursor < max; cursor++) {
    const pt0 = pts[cursor - 1];
    const pt = pts[cursor];

    u = Math.hypot(pt[0] - pt0[0], pt[1] - pt0[1]) * metersToUvFactor;

    createFace(cursor - 1, cursor);
  }

  const vec2s = pts.map((p) => {
    return new THREE.Vector2(p[0], p[1]);
  });

  const offset0 = offset;

  const roofCenter = new THREE.Vector3();

  // draw roof
  for (const vec of vec2s) {
    position.push(vec.x, vec.y, height);
    roofCenter.set(vec.x, vec.y, height);

    group.push(uniformType);
    uv.push(vec.x / tileSize.x, vec.y / tileSize.y);
    color.push(uniformColor.r, uniformColor.g, uniformColor.b);
    uv1.push(0.5, 0.5); // pure color.
    normal.push(0, 0, 1);
    offset += 1;
  }

  const roofs = THREE.ShapeUtils.triangulateShape(vec2s, []);

  for (const tri of roofs) {
    indices.push(offset0 + tri[0], offset0 + tri[1], offset0 + tri[2]);
  }

  geoAttriData.groupIndex += 1;
  geoAttriData.offset = offset;

  onComputed?.(roofCenter, properties);
}

type GeometryAttriData = {
  tileSize: Readonly<{ x: number; y: number }>;
  tileGrid: Readonly<{ x: number; y: number }>;
  offset: number;
  position: number[];
  group?: number[];
  groupIndex?: number;
  indices: number[];
  normal: number[];
  color: number[];
  uv: number[];
  uv1: number[];
};

const BuildingType = {
  industrial: 12,
  office: 9,
  commercial: 10,
  apartments: 0,
  residential: 1,
  unclassified: 8,
};

/**
 * Building Color Enum with lowercase keys and numeric hex values.
 */
enum BuildingColor {
  dormitory = 0xffadad,
  industrial = 0x707070,
  office = 0x5dade2,
  garage = 0x4d5656,
  commercial = 0xff8c00,
  apartments = 0xf0b27a,
  school = 0xf4d03f,
  residential = 0xabebc6,
  train_station = 0x5499c7,
  retail = 0xec7063,
  construction = 0xb7950b,
  roof = 0x34495e,
  parking = 0x2e4053,
  carport = 0x566573,
  kindergarten = 0xf7dc6f,
  ruins = 0xa93226,
  storage_tank = 0xd5d8dc,
  shed = 0x8d6e63,
  hospital = 0xffffff,
  warehouse = 0x85929e,
  temple = 0xaf7ac5,
  hotel = 0xeb984e,
}
