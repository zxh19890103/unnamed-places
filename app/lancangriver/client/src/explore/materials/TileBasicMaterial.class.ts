import * as THREE from "three";
import { SphereTileKey } from "../../calc/types";
import { BASE_URL } from "../../calc/constants";

type Parameters = {
  tileKey: SphereTileKey;
};

export class TileBasicMaterial extends THREE.ShaderMaterial {
  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    const { tileKey } = parameters;

    const satelliteTexture = textureLoader.load(
      `${BASE_URL}/raster/satellite/${tileKey.z}/${tileKey.x}/${tileKey.y}.jpeg`,
    );

    super({
      side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Color(0 ^ (Math.random() * 0xffffff)) },
        uSatelliteTexture: { value: satelliteTexture },
        uDemTexture: { value: null },
        uElevationScale: { value: 0 },
      },
      vertexShader: `
      uniform sampler2D uDemTexture;
      uniform float uElevationScale;

      varying vec2 vUv;

      void main() {
        vUv = uv;

        // vec3 demRgb = texture2D(uDemTexture, uv).rgb * 255.0;
        // float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;

        vec3 displaced = position;
        // displaced.z += elevation * uElevationScale;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
      fragmentShader: `
      uniform vec3 uColor;
      uniform sampler2D uSatelliteTexture;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(uSatelliteTexture, vUv);
        gl_FragColor = vec4(color.rgb, 1.0);
      }
    `,
    });
  }
}
