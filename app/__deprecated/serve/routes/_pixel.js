import sharp from "sharp";

/**
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns
 */
export function simplifyImage(inputPath, outputPath) {
  return sharp(inputPath)
    .median(20) // Remove noise while keeping edges
    .modulate({
      brightness: 1.5, // Significantly brighter overall
      saturation: 2.5, // Punchier, vibrant colors
      hue: 0,
    })
    .blur(1.2)
    .png({
      palette: true,
      colors: 6, // Force reduction to 16 colors
      quality: 100,
      compressionLevel: 9,
      dither: 0.0,
    })
    .resize({
      width: 1024,
      kernel: sharp.kernel.nearest,
    })
    .toFile(outputPath);
}

/**
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns
 */
export function extractGreenToMask(inputPath, outputPath) {
  return (
    sharp(inputPath)
      // 1. Ensure we are working with standard sRGB
      .toColourspace("srgb")
      // 2. Use 'reband' or channel manipulation to highlight green.
      // A common approach is (Green - Red - Blue) to isolate saturation.
      .extractChannel("green")
      // 3. Apply a threshold. Pixels above '128' become white (255),
      // pixels below become black (0).
      .threshold(140)
      .toFile(outputPath)
  );
}
