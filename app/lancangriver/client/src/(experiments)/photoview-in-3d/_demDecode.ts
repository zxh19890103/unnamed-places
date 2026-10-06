import * as THREE from 'three';

/**
 * Decode Terrarium encoded RGB elevation into meters:
 * elevation = (R * 256.0 + G + B / 256.0) - 32768.0
 */
export function decodeTerrarium(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const output = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    // Invert Y so row y=0 in PNG (North) maps to y=height-1 (v=1.0) in WebGL DataTexture
    const srcRow = y * width;
    const dstRow = (height - 1 - y) * width;

    for (let x = 0; x < width; x += 1) {
      const srcIdx = (srcRow + x) * 4;
      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];
      output[dstRow + x] = r * 256.0 + g + b / 256.0 - 32768.0;
    }
  }

  return output;
}

/**
 * Apply a 3x3 Gaussian blur with edge clamping:
 * Kernel = [1 2 1; 2 4 2; 1 2 1] / 16
 */
export function gaussianBlur3x3(src: Float32Array, width: number, height: number): Float32Array {
  const output = new Float32Array(width * height);

  const clamp = (val: number, min: number, max: number) =>
    val < min ? min : val > max ? max : val;

  for (let y = 0; y < height; y += 1) {
    const y0 = clamp(y - 1, 0, height - 1) * width;
    const y1 = y * width;
    const y2 = clamp(y + 1, 0, height - 1) * width;

    for (let x = 0; x < width; x += 1) {
      const x0 = clamp(x - 1, 0, width - 1);
      const x1 = x;
      const x2 = clamp(x + 1, 0, width - 1);

      // Row y-1
      const p00 = src[y0 + x0];
      const p01 = src[y0 + x1];
      const p02 = src[y0 + x2];

      // Row y
      const p10 = src[y1 + x0];
      const p11 = src[y1 + x1];
      const p12 = src[y1 + x2];

      // Row y+1
      const p20 = src[y2 + x0];
      const p21 = src[y2 + x1];
      const p22 = src[y2 + x2];

      const sum = p00 + 2 * p01 + p02 + (2 * p10 + 4 * p11 + 2 * p12) + (p20 + 2 * p21 + p22);

      output[y1 + x1] = sum / 16.0;
    }
  }

  return output;
}

/**
 * Hard clamp elevation deviations around a reference mean:
 * each pixel is bounded to [mean - threshold, mean + threshold].
 */
export function clampToMean(data: Float32Array, mean: number, threshold: number): void {
  const minVal = mean - threshold;
  const maxVal = mean + threshold;

  for (let i = 0; i < data.length; i += 1) {
    const val = data[i];
    if (val < minVal) {
      data[i] = minVal;
    } else if (val > maxVal) {
      data[i] = maxVal;
    }
  }
}

export type ProcessedDemResult = {
  data: Float32Array;
  width: number;
  height: number;
};

/**
 * Async pipeline: fetch DEM PNG -> extract RGBA -> decode Terrarium -> Gaussian blur -> clamp to mean.
 */
export async function loadProcessedDem(
  url: string,
  options: {
    mean: number;
    threshold: number;
    signal?: AbortSignal;
  },
): Promise<ProcessedDemResult> {
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch DEM tile from ${url}: status ${response.status}`);
  }

  const blob = await response.blob();
  let rgbaData: Uint8ClampedArray;
  let width: number;
  let height: number;

  if (typeof createImageBitmap !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width;
    height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to create OffscreenCanvas 2D context');
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    rgbaData = imgData.data;
    bitmap.close();
  } else {
    // Fallback using HTMLImageElement and HTMLCanvasElement
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = URL.createObjectURL(blob);
    });
    width = img.width;
    height = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to create 2D canvas context');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    rgbaData = imgData.data;
    URL.revokeObjectURL(img.src);
  }

  const decoded = decodeTerrarium(rgbaData, width, height);
  const blurred = gaussianBlur3x3(decoded, width, height);
  clampToMean(blurred, options.mean, options.threshold);

  return {
    data: blurred,
    width,
    height,
  };
}

/**
 * Create a Float32 RedFormat DataTexture for DEM elevation.
 * If provided a single number, creates a 1x1 placeholder texture.
 */
export function createDemDataTexture(
  source: ProcessedDemResult | { value: number },
): THREE.DataTexture {
  if ('value' in source) {
    const data = new Float32Array([source.value]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RedFormat, THREE.FloatType);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  const texture = new THREE.DataTexture(
    source.data,
    source.width,
    source.height,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
