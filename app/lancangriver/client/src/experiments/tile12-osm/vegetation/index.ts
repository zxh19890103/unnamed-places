import * as THREE from "three";
import { TileCoords } from "../../../osm/tiles";
import { TileProjection } from "../tile";

export function createPointsTrees(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
  projection: TileProjection,
  landClsMask: any,
) {
  const width = projection.widthMeters;
  const height = projection.heightMeters;

  const nX = 150;
  const nZ = 150;

  const n = Math.floor(nX * nZ);

  const pointsAttr = new THREE.Float32BufferAttribute(
    new Array(3 * n).fill(0),
    3,
  );

  const uvAttr = new THREE.Float32BufferAttribute(new Array(2 * n).fill(0), 2);

  const treesMetadataAttr = new THREE.Float32BufferAttribute(
    new Array(3 * n).fill(0),
    3,
  );

  const treesAltas = textureLoader.load("/trees_in-one.png");

  for (let x = 0; x < nX; x++) {
    for (let z = 0; z < nZ; z++) {
      const i = x * nZ + z;

      const px = -width / 2 + Math.random() * width;
      const pz = -height / 2 + Math.random() * height;

      pointsAttr.setXYZ(i, px, 0, pz);

      const u = THREE.MathUtils.clamp((px + width / 2) / width, 0, 1);
      const v = THREE.MathUtils.clamp((pz + height / 2) / height, 0, 1);
      uvAttr.setXY(i, u, v);

      treesMetadataAttr.setXYZ(
        i,
        Math.floor(Math.random() * 8),
        Math.floor(Math.random() * 8),
        0.5 + Math.random() * 0.5,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", pointsAttr);
  geometry.setAttribute("metadata", treesMetadataAttr);
  geometry.setAttribute("uv", uvAttr);

  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: treesAltas,
        },
        landClsMask: {
          value: landClsMask.material,
        },
      },
      vertexShader: `
    attribute vec3 metadata;

    flat out vec3 vMetadata;
    varying vec2 vUv;

    void main() {
      vec3 ipos = position.xyz;
      vec4 mvPos = modelViewMatrix * vec4(ipos, 1.0);

      float size_factor = metadata.b * 30000.0;
      gl_PointSize = size_factor / -mvPos.z;

      mvPos.y += 10.0;

      vMetadata = metadata;
      vUv = uv;

      gl_Position = projectionMatrix * vec4(mvPos.xyz, 1.0);
    }
    `,
      fragmentShader: `
    uniform sampler2D map;
    uniform sampler2D landClsMask;

    flat in vec3 vMetadata;
    varying vec2 vUv;

    void main() {
      float isVegetation = texture2D(landClsMask, vUv).r;

      if (isVegetation < 0.26) discard;
      gl_FragColor = vec4(isVegetation, 0.0, 0.0, 1.0);

      // if (isVegetation < 0.3) discard;

      // vec2 uv = gl_PointCoord;

      // uv.y = 1.0 - uv.y;
      // vec2 uv_offset = 0.125 * vec2(vMetadata.r, vMetadata.g);
      // uv = uv_offset  +  0.125 * uv;
      
      // vec4 baseColor = texture2D(map, uv);

      // if (baseColor.a < 0.5) discard;

      // vec3 outputColor = baseColor.rgb;
      // outputColor *= 0.56;

      // gl_FragColor = vec4(outputColor, 1.0);
    }
    `,
    }),
  );

  return {
    points,
    landClsMask,
  };
}
