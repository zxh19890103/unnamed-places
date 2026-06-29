import * as THREE from "three";
import { PhotoRecord } from "../../photos/types";
import { WorldExtent } from "../../calc/types";
import { ELEVATION_SCALE } from "../../calc/constants";

type Parameters = {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture;
  rec: PhotoRecord;
  worldExtent: WorldExtent;
  worldDemTexture: THREE.Texture;
};

export class PhotoMarkerMaterial extends THREE.ShaderMaterial {
  constructor(textureLoader: THREE.TextureLoader, params: Parameters) {
    const {
      color = "#ffffff",
      map,
      rec,
      worldExtent,
      worldDemTexture,
    } = params;

    const fallbackTexture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );

    fallbackTexture.needsUpdate = true;

    const t = (rec.lat - worldExtent.south) / worldExtent.latSpan;
    const s = (rec.lng - worldExtent.west) / worldExtent.lngSpan;

    super({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uMap: { value: map },
        uDemTexture: { value: worldDemTexture },
        uWorldUv: { value: new THREE.Vector2(s, t) },
        uElevationScale: { value: ELEVATION_SCALE },
      },
      vertexShader: /* glsl */ `
        uniform vec2 uWorldUv;
        uniform sampler2D uDemTexture;
        uniform float uElevationScale;
        varying vec2 vUv;
        
        void main() {
          vUv = uv;

          vec3 demRgb = texture2D(uDemTexture, uWorldUv).rgb * 255.0;
          float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;
          vec3 displaced = position + normal * (elevation * uElevationScale);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform sampler2D uMap;
        varying vec2 vUv;

        void main() {
          vec4 texel = texture2D(uMap, vUv);
          gl_FragColor = vec4(texel.rgb * uColor, texel.a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });

    this.userData = {
      ...(this.userData ?? {}),
      rec,
      fallbackTexture,
    };
  }

  override dispose(): void {
    const map = this.uniforms.uMap?.value;
    if (map instanceof THREE.Texture) {
      map.dispose();
    }

    const fallbackTexture = this.userData?.fallbackTexture;
    if (fallbackTexture instanceof THREE.Texture) {
      fallbackTexture.dispose();
    }

    super.dispose();
  }
}
