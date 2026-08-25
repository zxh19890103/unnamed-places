import * as THREE from 'three';
import { TileCoords } from '@/tile12-osm/vector-tiles.js';
import { shaderGlslSegments, uniformSettings } from '../_cfg.js';

export function createBuildingRoofMaterial(
  palette: string,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const roofMap = textureLoader.load('/textures/roofs.jpg');

  const material = new THREE.ShaderMaterial({
    wireframe: false,
    uniforms: {
      map: { value: roofMap },
      baseColor: { value: new THREE.Color(palette) },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec3 vWorldNormal;
varying vec2 vUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vWorldNormal = normalize(normalMatrix * normal);

  vec3 displacePosition = position;
  vUv = uv;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform vec3 baseColor;
uniform sampler2D map;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(map, fract(vUv));

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color.rgb * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  textureLoader.loadAsync(uniformSettings.getTerrariumInfoUrl(tile)).then((data) => {
    material.uniforms.terrianMap.value = data;
    material.uniforms.terrianMapLoaded.value = 1;
  });

  return material;
}
