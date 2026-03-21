import sharp from "sharp";

/**
 * Analyzes a satellite tile for vegetation and outputs a visual mask.
 * @param {string} inputPath - Path to the input map tile.
 * @param {string} outputPath - Path to save the resulting mask.
 */
async function generateVegetationMask(inputPath, outputPath) {
  try {
    console.log(`Analyzing: ${inputPath}...`);

    // 1. Load the image and get raw pixel data
    const { data, info } = await sharp(inputPath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    let greenPixelCount = 0;
    const totalPixels = info.width * info.height;

    // 2. Iterate and Modify the Raw Buffer directly
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // --- Simple Vegetation Threshold ---
      // You can adjust 'g > 50' if it's too sensitive or not sensitive enough
      // const isGreen = g > r && g > b && g > 100;
      const isGreen = 2 * g - r - b > 30;

      if (isGreen) {
        greenPixelCount++;
        // Set the pixel to PURE MAGENTA (for high contrast against black)
        data[i] = 255; // Red
        data[i + 1] = 0; // Green
        data[i + 2] = 255; // Blue
      } else {
        // Set non-vegetation pixels to BLACK
        data[i] = 0; // Red
        data[i + 1] = 0; // Green
        data[i + 2] = 0; // Blue
      }

      // (If the image had an alpha channel, we could make non-veg pixels transparent here)
      // if (info.channels === 4 && !isGreen) { data[i+3] = 0; }
    }

    const percentage = ((greenPixelCount / totalPixels) * 100).toFixed(2);
    console.log(`Vegetation Cover: ${percentage}%`);

    // 3. Save the modified buffer back as an image
    console.log(`Saving mask to: ${outputPath}`);
    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .toFormat("png") // PNG is usually best for masks as it's lossless
      .toFile(outputPath);

    console.log("Done!");
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

async function generateGreyMask(inputPath, outputPath) {
  sharp(inputPath)
    .grayscale() //
    .median()
    .threshold(80)
    .toFormat("png")
    .toFile(outputPath);
}

// EXAMPLE USAGE:
// (Make sure 'satellite_tile.jpg' exists in the same folder)
// generateVegetationMask("./.data/1767.jpeg", "vegetation_mask.png");
generateGreyMask("./.data/1767.jpeg", "grey_threhold_mask.png");
