import * as THREE from 'three';

/**
 * Decode Terrarium encoded RGB elevation into meters:
 * elevation = (R * 256.0 + G + B / 256.0) - 32768.0
 */
function decodeTerrarium(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
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
function gaussianBlur3x3(src: Float32Array, width: number, height: number): Float32Array {
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
 * Apply a Gaussian blur in place using live samples spaced by sampleSpacing pixels.
 * Leave the outermost rows and columns unchanged; clamp samples for interior pixels.
 * Estimate slope from weighted neighborhood heights before blurring, using ground distances.
 * Apply full blur below 2 degrees, fading smoothly to no blur at 8 degrees.
 * Kernel = [1 2 1; 2 4 2; 1 2 1] / 16. Resolution is unchanged.
 * Runs left-to-right, top-to-bottom, so later pixels see earlier corrections.
 * Returns the same array. A sampleSpacing of 2 samples neighbors two pixels apart.
 */
function _gaussianBlurSpaced3x3(
  src: Float32Array,
  width: number,
  height: number,
  sampleSpacing: number,
  pixelSizeMeters: { x: number; y: number },
): Float32Array {
  const effectiveSpacing = Math.max(1, Math.floor(sampleSpacing));
  const clamp = (val: number, min: number, max: number) =>
    val < min ? min : val > max ? max : val;
  const original = new Float32Array(src);
  const fullBlurSlope = Math.tan((2 * Math.PI) / 180);
  const noBlurSlope = Math.tan((8 * Math.PI) / 180);
  const columnHeights = new Float64Array(3);
  const rowHeights = new Float64Array(3);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      columnHeights.fill(0);
      rowHeights.fill(0);

      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = clamp(y + dy * effectiveSpacing, 0, height - 1);
        const yWeight = dy === 0 ? 2 : 1;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = clamp(x + dx * effectiveSpacing, 0, width - 1);
          const xWeight = dx === 0 ? 2 : 1;
          sum += src[yy * width + xx] * xWeight * yWeight;
          columnHeights[dx + 1] += (original[yy * width + xx] * yWeight) / 4;
          rowHeights[dy + 1] += (original[yy * width + xx] * xWeight) / 4;
        }
      }

      // Measure both sides separately so a ridge or hilltop cannot cancel its own slope.
      const slopeX = Math.max(
        Math.abs(columnHeights[1] - columnHeights[0]) /
          (Math.min(x, effectiveSpacing) * pixelSizeMeters.x),
        Math.abs(columnHeights[2] - columnHeights[1]) /
          (Math.min(width - 1 - x, effectiveSpacing) * pixelSizeMeters.x),
      );
      const slopeY = Math.max(
        Math.abs(rowHeights[1] - rowHeights[0]) /
          (Math.min(y, effectiveSpacing) * pixelSizeMeters.y),
        Math.abs(rowHeights[2] - rowHeights[1]) /
          (Math.min(height - 1 - y, effectiveSpacing) * pixelSizeMeters.y),
      );
      const slope = Math.hypot(slopeX, slopeY);
      if (slope >= noBlurSlope) continue;

      const fade = clamp((slope - fullBlurSlope) / (noBlurSlope - fullBlurSlope), 0, 1);
      const blurWeight = 1 - fade * fade * (3 - 2 * fade);
      const index = y * width + x;
      src[index] += (sum / 16 - src[index]) * blurWeight;
    }
  }

  return src;
}

/**
 * Apply a Gaussian blur in place using live samples spaced by sampleSpacing pixels.
 * Leave the outermost rows and columns unchanged; clamp samples for interior pixels.
 * Kernel = [1 2 1; 2 4 2; 1 2 1] / 16. Resolution is unchanged.
 * Runs left-to-right, top-to-bottom, so later pixels see earlier corrections.
 * Returns the same array. A sampleSpacing of 2 samples neighbors two pixels apart.
 */
function gaussianBlurSpaced3x3(
  src: Float32Array,
  width: number,
  height: number,
  sampleSpacing: number,
): Float32Array {
  const effectiveSpacing = Math.max(1, Math.floor(sampleSpacing));
  const clamp = (val: number, min: number, max: number) =>
    val < min ? min : val > max ? max : val;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = clamp(y + dy * effectiveSpacing, 0, height - 1);
        const yWeight = dy === 0 ? 2 : 1;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = clamp(x + dx * effectiveSpacing, 0, width - 1);
          const xWeight = dx === 0 ? 2 : 1;
          sum += src[yy * width + xx] * xWeight * yWeight;
        }
      }

      src[y * width + x] = sum / 16;
    }
  }

  return src;
}

/**
 * Remove isolated outliers by comparing each pixel to the mean of its 3x3 neighborhood.
 * If the gap exceeds the threshold, replace the current pixel with the local mean.
 */
function removeLocalOutliers3x3(
  src: Float32Array,
  width: number,
  height: number,
  threshold: number,
): Float32Array {
  const output = new Float32Array(src);

  const clamp = (val: number, min: number, max: number) =>
    val < min ? min : val > max ? max : val;

  for (let y = 0; y < height; y += 1) {
    const y0 = clamp(y - 1, 0, height - 1);
    const y1 = y;
    const y2 = clamp(y + 1, 0, height - 1);

    for (let x = 0; x < width; x += 1) {
      const x0 = clamp(x - 1, 0, width - 1);
      const x1 = x;
      const x2 = clamp(x + 1, 0, width - 1);

      const center = src[y1 * width + x1];
      let sum = 0.0;
      let count = 0;

      for (let yy = y0; yy <= y2; yy += 1) {
        for (let xx = x0; xx <= x2; xx += 1) {
          if (xx === x1 && yy === y1) continue;
          sum += src[yy * width + xx];
          count += 1;
        }
      }

      if (count === 0) continue;

      const localMean = sum / count;
      if (Math.abs(center - localMean) > threshold) {
        output[y1 * width + x1] = localMean;
      }
    }
  }

  return output;
}

/**
 * Remove outliers in place using the median of live neighbors spaced by sampleSpacing pixels.
 * Excludes the center and out-of-bounds samples; even counts average the two middle values.
 * Runs left-to-right, top-to-bottom, so later pixels see earlier corrections.
 * Returns the same array. A sampleSpacing of 2 samples neighbors two pixels apart.
 */
function removeLocalOutliersSpaced3x3(
  src: Float32Array,
  width: number,
  height: number,
  sampleSpacing: number,
  threshold: number,
): Float32Array {
  const effectiveSpacing = Math.max(1, Math.floor(sampleSpacing));
  const neighbors: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = src[y * width + x];
      neighbors.length = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy * effectiveSpacing;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx * effectiveSpacing;
          if (xx < 0 || xx >= width) continue;
          if (dx === 0 && dy === 0) continue;

          neighbors.push(src[yy * width + xx]);
        }
      }

      if (neighbors.length === 0) continue;

      neighbors.sort((a, b) => a - b);
      const middle = Math.floor(neighbors.length / 2);
      const localMedian =
        neighbors.length % 2 === 0
          ? (neighbors[middle - 1] + neighbors[middle]) / 2
          : neighbors[middle];
      if (Math.abs(center - localMedian) > threshold) {
        src[y * width + x] = localMedian;
      }
    }
  }

  return src;
}

/**
 * Hard clamp elevation deviations around a reference mean:
 * each pixel is bounded to [mean - threshold, mean + threshold].
 */
function clampToMean(data: Float32Array, mean: number, threshold: number): void {
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
 * Compute signed, unit-length RGBA normals from the final DEM, with one-sided edge differences.
 * Decoded rows run south to north, so increasing row indices point toward world -Z.
 */
export function computeDemNormals(
  { data, width, height }: ProcessedDemResult,
  metersPerTexel: THREE.Vector2,
): Float32Array {
  const normals = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const south = Math.max(0, y - 1);
    const north = Math.min(height - 1, y + 1);

    for (let x = 0; x < width; x += 1) {
      const west = Math.max(0, x - 1);
      const east = Math.min(width - 1, x + 1);
      const slopeEast =
        east === west
          ? 0
          : (data[y * width + east] - data[y * width + west]) / ((east - west) * metersPerTexel.x);
      const slopeNorth =
        north === south
          ? 0
          : (data[north * width + x] - data[south * width + x]) /
            ((north - south) * metersPerTexel.y);
      const length = Math.hypot(slopeEast, 1, slopeNorth);
      const index = (y * width + x) * 4;
      normals[index] = -slopeEast / length;
      normals[index + 1] = 1 / length;
      normals[index + 2] = slopeNorth / length;
      normals[index + 3] = 1;
    }
  }

  return normals;
}

/** Signed normals use linear float sampling, just like the elevation texture. */
export function createDemNormalTexture(source?: {
  normals: Float32Array;
  width: number;
  height: number;
}): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    source?.normals ?? new Float32Array([0, 1, 0, 1]),
    source?.width ?? 1,
    source?.height ?? 1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Async pipeline: fetch DEM PNG -> extract RGBA -> decode Terrarium -> Gaussian blur -> remove local outliers -> clamp to mean.
 */
export async function loadProcessedDem(
  url: string,
  options: {
    mean: number;
    threshold: number;
    signal?: AbortSignal;
    outlierThreshold?: number;
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
  const outlierThreshold = options.outlierThreshold ?? 60;

  removeLocalOutliersSpaced3x3(decoded, width, height, 18, outlierThreshold);
  // gaussianBlurSpaced3x3(decoded, width, height, 10);
  clampToMean(decoded, options.mean, options.threshold);

  return {
    data: decoded,
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
