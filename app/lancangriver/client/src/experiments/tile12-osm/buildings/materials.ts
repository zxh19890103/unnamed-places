import * as THREE from "three";
import { TileCoords } from "../../../osm/tiles.js";
import { shaderGlslSegments, uniformSettings } from "../_cfg.js";
import {
  BUILDING_ATLAS_UV_INSET,
  BUILDING_FACE_TEXTURE_GRID,
  BUILDING_TEXTURE_GRID,
  BUILDING_WALL_TEXTURE_UV_SCALE,
} from "./base.js";

export function createBuildingWallMaterial(
  color: string,
  texture: THREE.Texture | null,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      useTexture: { value: texture !== null },
      baseColor: { value: new THREE.Color(color) },
      atlasGridSize: { value: BUILDING_TEXTURE_GRID.clone() },
      atlasUvInset: { value: BUILDING_ATLAS_UV_INSET },
      wallTextureUvScale: { value: BUILDING_WALL_TEXTURE_UV_SCALE },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;
  vWorldNormal = normalize(normalMatrix * normal);
  vAtlasGridIndex = metadata.xy;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform bool useTexture;
uniform vec3 baseColor;
uniform vec2 atlasGridSize;
uniform vec2 atlasUvInset;
uniform vec3 lightDirection;
uniform float ambientStrength;
uniform float wallTextureUvScale;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

void main() {
  vec3 color = baseColor;

  if (useTexture) {
    // Keep lookups away from per-cell borders to avoid atlas bleeding seams.
    vec2 localUv = fract(vUv * wallTextureUvScale);
    localUv = localUv * (1.0 - atlasUvInset * 2.0) + atlasUvInset;
    vec2 atlasUv = (vAtlasGridIndex + localUv) / atlasGridSize;
    vec4 sampledDiffuseColor = texture2D(map, atlasUv);
    float patternLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float patternFactor = mix(0.7, 0.96, patternLuma);
    color *= patternFactor;
  }

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);
  
  if (!gl_FrontFacing) {
    normal *= -1.0;
  }
  
  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  return material;
}

export function createBuildingFaceMaterial(
  color: string,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  textureLoader
    .loadAsync(`/textures/building-face-atlas-v2.png`)
    .then((data) => {
      material.uniforms.map.value = data;
      material.uniforms.mapLoaded.value = true;
    });

  const BUILDING_ATLAS_UV_INSET = new THREE.Vector2(0, 0);
  const BUILDING_WALL_TEXTURE_UV_SCALE = 0.4;

  const material = new THREE.ShaderMaterial({
    wireframe: false,
    uniforms: {
      map: { value: null },
      mapLoaded: { value: false },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      baseColor: { value: new THREE.Color(color) },
      atlasGridSize: { value: BUILDING_FACE_TEXTURE_GRID.clone() },
      atlasUvInset: { value: BUILDING_ATLAS_UV_INSET },
      wallTextureUvScale: { value: BUILDING_WALL_TEXTURE_UV_SCALE },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;
  vWorldNormal = normalize(normalMatrix * normal);
  vAtlasGridIndex = metadata.xy;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform bool mapLoaded;
uniform vec3 baseColor;
uniform vec2 atlasGridSize;
uniform vec2 atlasUvInset;
uniform vec3 lightDirection;
uniform float ambientStrength;
uniform float wallTextureUvScale;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

void main() {
  vec3 color = baseColor;

  if (mapLoaded) {
    // Keep lookups away from per-cell borders to avoid atlas bleeding seams.
    vec2 localUv = fract(vUv * wallTextureUvScale);
    localUv = localUv * (1.0 - atlasUvInset * 2.0) + atlasUvInset;
    vec2 atlasUv = (vAtlasGridIndex + localUv) / atlasGridSize;
    vec4 sampledDiffuseColor = texture2D(map, atlasUv);
    float patternLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float patternFactor = mix(0.7, 0.96, patternLuma);
    color = sampledDiffuseColor.rgb * patternFactor;
  }

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);
  
  if (!gl_FrontFacing) {
    normal *= -1.0;
  }
  
  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  return material;
}
