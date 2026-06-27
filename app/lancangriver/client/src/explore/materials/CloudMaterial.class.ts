import * as THREE from "three";

type Parameters = {
  color?: THREE.ColorRepresentation;
  size?: number;
  opacity?: number;
  softness?: number;
  sizeAttenuation?: boolean;
  viewportHeight?: number;
  atlasTexture?: THREE.Texture;
  atlasGrid?: number;
};

function createFallbackAtlasTexture() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export class CloudMaterial extends THREE.ShaderMaterial {
  /**
   * the basic logic is the same to THREE.PointsMaterial,
   * but we'll add more subtle changes in shader.
   * @param params
   */
  constructor(params: Parameters) {
    const {
      color = 0xffffff,
      size = 48,
      opacity = 0.8,
      softness = 0.5,
      sizeAttenuation = false,
      viewportHeight,
      atlasTexture,
      atlasGrid = 4,
    } = params;

    const defaultViewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    const fallbackAtlasTexture = createFallbackAtlasTexture();

    super({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uSize: { value: Math.max(1, size) },
        uOpacity: { value: THREE.MathUtils.clamp(opacity, 0, 1) },
        uSoftness: { value: THREE.MathUtils.clamp(softness, 0.05, 0.95) },
        uSizeAttenuation: { value: sizeAttenuation ? 1 : 0 },
        uViewportHeight: {
          value: Math.max(1, viewportHeight ?? defaultViewportHeight),
        },
        uAtlasTexture: { value: atlasTexture ?? fallbackAtlasTexture },
        uAtlasGrid: { value: Math.max(1, Math.floor(atlasGrid)) },
      },
      vertexShader: `
      uniform float uSize;
      uniform float uSizeAttenuation;
      uniform float uViewportHeight;

      attribute float spriteIndex;

      varying float vSpriteIndex;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

        float pointSize = uSize;
        if (uSizeAttenuation > 0.5) {
          pointSize *= (uViewportHeight / max(1.0, -mvPosition.z));
        }

        vSpriteIndex = spriteIndex;
        gl_PointSize = max(1.0, pointSize);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
      fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSoftness;
      uniform sampler2D uAtlasTexture;
      uniform float uAtlasGrid;

      varying float vSpriteIndex;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        float index = floor(vSpriteIndex + 0.5);
        float col = mod(index, uAtlasGrid);
        float row = floor(index / uAtlasGrid);

        vec2 atlasUv = (vec2(col, row) + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / uAtlasGrid;
        vec4 atlasSample = texture2D(uAtlasTexture, atlasUv);

        vec2 centered = gl_PointCoord - vec2(0.5);
        float dist = length(centered) * 2.0;

        float alphaMask = 1.0 - smoothstep(1.0 - uSoftness, 1.0, dist);
        float grain = mix(0.94, 1.0, hash12(gl_PointCoord * 31.0));
        float alpha = uOpacity * alphaMask * atlasSample.a * grain;

        if (alpha <= 0.001) {
          discard;
        }

        gl_FragColor = vec4(uColor * atlasSample.rgb, alpha);
      }
    `,
    });
  }
}
