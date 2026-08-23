import * as THREE from "three";
import { TileCoords } from "@/osm/tiles.js";
import { shaderGlslSegments, uniformSettings } from "../_cfg.js";

export function createWaterMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const map = textureLoader.load("/textures/istockphoto-118337676-612x612.jpg");

  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;

  const normalsMap = textureLoader.load("/textures/waternormals.jpg");
  normalsMap.wrapS = THREE.MirroredRepeatWrapping;
  normalsMap.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#2C6F8C") },
      map: { value: map },
      normalsMap: { value: normalsMap },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;
attribute vec2 flowUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vFlowUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vFlowUv = gisUv;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform sampler2D normalsMap;

uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec2 vFlowUv;

void main() {
  vec2 uv = fract(vFlowUv * 40.0);
  // vec3 texColor = texture2D(map, uv).rgb;
  vec3 normal = texture2D( normalsMap, uv).rgb;
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(baseColor * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
    depthTest: false,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}

export function createWaterRiverMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const map = textureLoader.load("/textures/istockphoto-118337676-612x612.jpg");

  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;

  const normalsMap = textureLoader.load("/textures/waternormals.jpg");
  normalsMap.wrapS = THREE.MirroredRepeatWrapping;
  normalsMap.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#3B9FC4") },
      map: { value: map },
      normalsMap: { value: normalsMap },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;
attribute vec2 flowUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vFlowUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vFlowUv = gisUv;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform sampler2D normalsMap;

uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec2 vFlowUv;

void main() {
  vec2 uv = fract(vFlowUv * 40.0);
  // vec3 texColor = texture2D(map, uv).rgb;
  vec3 normal = texture2D( normalsMap, uv).rgb;
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(baseColor * lighting, 1.0);
}
`,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}
