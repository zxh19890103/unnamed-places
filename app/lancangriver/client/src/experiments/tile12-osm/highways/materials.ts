import * as THREE from "three";
import { TileCoords } from "@/osm/tiles";
import { shaderGlslSegments, uniformSettings } from "../_cfg.js";

export function createHighwayMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
) {
  const texture = textureLoader.load("/textures/highway.jpeg");

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      data.magFilter = THREE.LinearFilter;
      data.minFilter = THREE.LinearFilter;

      data.wrapS = THREE.ClampToEdgeWrapping;
      data.wrapT = THREE.ClampToEdgeWrapping;

      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      offGroundMeters: { value: 0 },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0 },
      color: { value: new THREE.Color("#3f444b") },
    },
    vertexShader: /*glsl */ `
attribute vec2 gisUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;
uniform float offGroundMeters;

varying vec3 vNormal;
varying vec2 vUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;

  vNormal = normalize(normalMatrix * normal);

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    displacePosition.y += decodeTerrariumHeight(rgb);
  }

  displacePosition.y += offGroundMeters;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: /*glsl */ `
uniform vec3 color;
uniform sampler2D map;

varying vec2 vUv;

void main() {
    float u = vUv.s;
    float v = vUv.t;

    vec4 baseColor = texture2D(map, vec2(u, v));
    gl_FragColor = vec4(baseColor.rgb, 1.0);
}
`,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  return material;
}

export function createHighwayPolygonMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#546") },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec3 vWorldNormal;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vWorldNormal = normalize(normalMatrix * normal);

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
uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec3 vWorldNormal;

void main() {
  vec3 normal = normalize(vWorldNormal);
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
