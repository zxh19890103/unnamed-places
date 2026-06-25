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
  sharp(inputPath).median(20).sharpen().toFormat("png").toFile(outputPath);
}

async function cartoonishMapTile(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      // 1. Prep: gentle blur to smooth map gradients (helps vibrant look without noise)
      .blur(0.9)
      .median(6)
      // 2. Make it SHINE here — key parameters!
      .modulate({
        saturation: 2.0, // vivid colors
        brightness: 1.3, // ← MAIN LIGHTEN knob: 1.2–1.5
        lightness: 30, // ← additive lift: 20–50 for extra brightness
        hue: 0,
      })

      // 3. Add contrast for glossy pop (gamma <1 darkens mids + boosts perceived shine)
      // .gamma(1.85) // 0.8–0.95 → stronger contrast without clipping
      // .linear(1.25, 40)

      // Alternative contrast methods (pick one):
      // .linear(1.4, -30)    // slope 1.2–1.6 + negative intercept for punchy contrast
      // .normalize()         // auto-stretch contrast (sometimes too aggressive)

      // 4. Sharpen to make everything crisp & shiny
      .sharpen({
        sigma: 1.3, // 1.0–1.8; higher = more defined "gloss"
        m1: 1.0,
        m2: 2.0,
      })

      // 5. Reduce colors while preserving the boosted vibrancy
      .png({
        palette: true,
        colours: 16, // 8–16 recommended for shining cartoon maps
        quality: 92, // high to avoid compression dulling the shine
        effort: 7, // better palette selection
      })

      .toFile(outputPath);

    console.log("Cartoon-ish tile saved!");
  } catch (err) {
    console.error("Error:", err);
  }
}

// EXAMPLE USAGE:
// (Make sure 'satellite_tile.jpg' exists in the same folder)
// generateVegetationMask("./.data/1767.jpeg", "vegetation_mask.png");
cartoonishMapTile("./.data/tilepic.jpeg", "../../public/assets/tilepic.png");
