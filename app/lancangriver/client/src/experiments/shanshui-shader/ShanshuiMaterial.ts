import * as THREE from "three";
import { ELEVATION_SCALE } from "../../calc/constants";

export type ElevationRange = {
  minMeters: number;
  maxMeters: number;
};

export function computeElevationRangeFromTerrariumPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ElevationRange {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { minMeters: 0, maxMeters: 1 };
  }

  let minMeters = Number.POSITIVE_INFINITY;
  let maxMeters = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const offset = (row * width + col) * 4;
      const r = (pixels[offset] ?? 0) / 255.0;
      const g = (pixels[offset + 1] ?? 0) / 255.0;
      const b = (pixels[offset + 2] ?? 0) / 255.0;
      const heightMeters =
        r * 255.0 * 256.0 + g * 255.0 + (b * 255.0) / 256.0 - 32768.0;

      minMeters = Math.min(minMeters, heightMeters);
      maxMeters = Math.max(maxMeters, heightMeters);
    }
  }

  if (!Number.isFinite(minMeters) || !Number.isFinite(maxMeters)) {
    return { minMeters: 0, maxMeters: 1 };
  }

  return {
    minMeters,
    maxMeters: Math.max(maxMeters, minMeters + 1),
  };
}

type ShanshuiMaterialParameters = {
  demTexture?: THREE.Texture | null;
  derivativesTexture?: THREE.Texture | null;
  displacementScale?: number;
};

export class ShanshuiMaterial extends THREE.ShaderMaterial {
  private demTexture: THREE.Texture | null = null;
  private derivativesTexture: THREE.Texture | null = null;

  constructor(parameters: ShanshuiMaterialParameters = {}) {
    const {
      demTexture = null,
      derivativesTexture = null,
      displacementScale = ELEVATION_SCALE,
    } = parameters;

    super({
      uniforms: {
        uDemTexture: { value: demTexture },
        uDerivativesTexture: { value: derivativesTexture },
        uDemReady: { value: demTexture ? 1.0 : 0.0 },
        uDerivativesReady: { value: derivativesTexture ? 1.0 : 0.0 },
        uDisplacementScale: { value: displacementScale },
        uSunAzimuthRad: { value: 2.45 },
        uSunElevationRad: { value: 0.8 },
        uAmbientStrength: { value: 0.36 },
        uDiffuseStrength: { value: 0.92 },
        uShowNormals: { value: 0.0 },
        uDemTexelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        uSlopeDarkenStrength: { value: 0.1 },
        uElevationMinMeters: { value: 0.0 },
        uElevationMaxMeters: { value: 4000.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeightMeters;

        uniform sampler2D uDemTexture;
        uniform float uDemReady;
        uniform float uDisplacementScale;

        float decodeTerrariumHeight(vec3 rgb) {
          return (rgb.r * 255.0 * 256.0 + rgb.g * 255.0 + (rgb.b * 255.0) / 256.0) - 32768.0;
        }

        void main() {
          vUv = uv;
          vHeightMeters = 0.0;

          vec3 displacedPosition = position;

          if (uDemReady > 0.5) {
            vec3 demRgb = texture2D(uDemTexture, uv).rgb;
            float heightMeters = decodeTerrariumHeight(demRgb);
            vHeightMeters = heightMeters;
            displacedPosition += normal * (heightMeters * uDisplacementScale);
          }

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeightMeters;

        uniform sampler2D uDerivativesTexture;
        uniform sampler2D uDemTexture;
        uniform float uDerivativesReady;
        uniform float uSunAzimuthRad;
        uniform float uSunElevationRad;
        uniform float uAmbientStrength;
        uniform float uDiffuseStrength;
        uniform float uShowNormals;
        uniform vec2 uDemTexelSize;
        uniform float uSlopeDarkenStrength;
        uniform float uElevationMinMeters;
        uniform float uElevationMaxMeters;

        vec3 normalFromSlopeAspect(float slopeRad, float aspectRad) {
          vec3 n = vec3(
            sin(slopeRad) * cos(aspectRad),
            sin(slopeRad) * sin(aspectRad),
            cos(slopeRad)
          );

          return normalize(n);
        }

        float hillshade(float slopeRad, float aspectRad, float sunAzimuth, float sunElevation) {
          float zenith = 1.57079632679 - sunElevation;
          return cos(zenith) * cos(slopeRad)
            + sin(zenith) * sin(slopeRad) * cos(sunAzimuth - aspectRad);
        }

        vec3 terrainColorRamp(float elevationMeters, float slopeDeg) {
          float s = clamp(slopeDeg / 90.0, 0.0, 1.0);
          vec3 baseTerrain = vec3(0.42, 0.47, 0.34);
          vec3 steepTint = vec3(0.28, 0.24, 0.21);
          vec3 slopeTint = mix(baseTerrain, steepTint, s * 0.35);
          float darkenTarget = clamp(1.0 - 0.45 * uSlopeDarkenStrength, 0.0, 1.0);
          float slopeDarken = mix(1.0, darkenTarget, smoothstep(0.88, 0.95, s));

          return slopeTint * slopeDarken;
        }

        float decodeTerrariumHeight(vec3 rgb) {
          return (rgb.r * 255.0 * 256.0 + rgb.g * 255.0 + (rgb.b * 255.0) / 256.0) - 32768.0;
        }

        float sampleHeight(vec2 uv) {
          return decodeTerrariumHeight(texture2D(uDemTexture, uv).rgb);
        }

        void main() {
          if (uDerivativesReady < 0.5) {
            gl_FragColor = vec4(0.22, 0.24, 0.28, 1.0);
            return;
          }

          vec4 derivativesSample = texture2D(uDerivativesTexture, vUv);
          float slopeDeg = derivativesSample.r * 90.0;
          float sinAspect = derivativesSample.g * 2.0 - 1.0;
          float cosAspect = derivativesSample.b * 2.0 - 1.0;

          float aspectRad = atan(sinAspect, cosAspect);
          if (aspectRad < 0.0) {
            aspectRad += 6.28318530718;
          }

          float slopeRad = radians(slopeDeg);
          vec3 terrainNormal = normalFromSlopeAspect(slopeRad, aspectRad);

          if (uShowNormals > 0.5) {
            vec3 normalColor = terrainNormal * 0.5 + 0.5;
            gl_FragColor = vec4(normalColor, 1.0);
            return;
          }

          float lit = max(hillshade(slopeRad, aspectRad, uSunAzimuthRad, uSunElevationRad), 0.0);

          vec3 baseColor = terrainColorRamp(vHeightMeters, slopeDeg);

          float lightFactor = clamp(uAmbientStrength + lit * uDiffuseStrength, 0.0, 1.4);
          vec3 color = baseColor;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.demTexture = demTexture;
    this.derivativesTexture = derivativesTexture;
  }

  override dispose(): void {
    if (this.demTexture) {
      this.demTexture.dispose();
      this.demTexture = null;
    }

    if (this.derivativesTexture) {
      this.derivativesTexture.dispose();
      this.derivativesTexture = null;
    }

    this.uniforms.uDemTexture.value = null;
    this.uniforms.uDerivativesTexture.value = null;
    this.uniforms.uDemReady.value = 0.0;
    this.uniforms.uDerivativesReady.value = 0.0;

    super.dispose();
  }

  setDemTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.demTexture = texture;
    this.uniforms.uDemTexture.value = texture;
    this.uniforms.uDemReady.value = 1.0;
  }

  setDerivativesTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.derivativesTexture = texture;
    this.uniforms.uDerivativesTexture.value = texture;
    this.uniforms.uDerivativesReady.value = 1.0;
  }

  setShowNormals(enabled: boolean): void {
    this.uniforms.uShowNormals.value = enabled ? 1.0 : 0.0;
  }

  setSlopeDarkenStrength(strength: number): void {
    this.uniforms.uSlopeDarkenStrength.value = THREE.MathUtils.clamp(
      strength,
      0.0,
      2.0,
    );
  }

  setElevationRange(minMeters: number, maxMeters: number): void {
    const safeMin = Number.isFinite(minMeters) ? minMeters : 0;
    const safeMax = Number.isFinite(maxMeters) ? maxMeters : safeMin + 1;

    this.uniforms.uElevationMinMeters.value = safeMin;
    this.uniforms.uElevationMaxMeters.value = Math.max(safeMax, safeMin + 1);
  }
}
