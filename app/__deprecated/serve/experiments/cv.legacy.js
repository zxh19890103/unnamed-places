import cv from "@u4/opencv4nodejs";

async function detectSatelliteBuildings() {
  // 1. Load the image
  const img = cv.imread("./satellite_map.jpg");

  const hsvImg = img.cvtColor(cv.COLOR_BGR2HSV);

  const hls = img.cvtColor(cv.COLOR_BGR2HLS);

  // 1. 提取亮色块（潜在建筑屋顶）
  const lightMask = hls.inRange(
    new cv.Vec3(0, 160, 0),
    new cv.Vec3(180, 255, 60),
  );

  // 2. 提取深色块（潜在阴影）
  const darkMask = hls.inRange(new cv.Vec3(0, 0, 0), new cv.Vec3(180, 60, 255));

  // 3. 对亮色块进行膨胀，让它稍微“跨出”一点去碰阴影
  const kernel00 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
  const expandedLight = lightMask.dilate(kernel00);

  // 4. 关键点：找出“膨胀后的亮块”与“暗块”重叠的地方
  // 只有建筑旁边才会有这种高频的明暗交替
  const overlap = expandedLight.bitwiseAnd(darkMask);
  cv.imshowWait("Satellite Detection overlap", overlap);

  // 5. 寻找这些重叠区域的中心
  const contours0 = overlap.findContours(
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );
  const result = img.copy();
  contours0.forEach((cnt) => {
    if (cnt.area > 100) {
      // 过滤掉太小的噪点
      const moments = cnt.moments();
      const centerX = moments.m10 / moments.m00;
      const centerY = moments.m01 / moments.m00;

      // 在原图上画个圆，标记建筑的大概位置
      result.drawCircle(
        new cv.Point2(centerX, centerY),
        20,
        new cv.Vec3(0, 0, 255),
        3,
      );

      // 或者画出这个区域的包围框
      // const rect = cnt.boundingRect();
      // 往右偏移一点，因为重叠区通常在建筑边缘
      // result.drawRectangle(
      //   new cv.Point2(rect.x - 20, rect.y - 20),
      //   new cv.Point2(rect.x + rect.width + 20, rect.y + rect.height + 20),
      //   new cv.Vec3(0, 255, 0),
      //   2,
      // );
    }
  });

  cv.imshowWait("Satellite Detection result ", result);

  // $0 \text{-} 180$$130 \text{-} 255$$0 \text{-} 40$
  const lowerGrey = new cv.Vec3(0, 0, 130); // Lower bound (H, S, V)
  const upperGrey = new cv.Vec3(180, 60, 255); // Upper bound (H, S, V)
  // 4. Create the Mask
  const mask = hsvImg.inRange(lowerGrey, upperGrey);

  const kernel0 = new cv.Mat(3, 3, cv.CV_8U, 1);
  const cleanedMask = mask.morphologyEx(kernel0, cv.MORPH_CLOSE);
  cv.imshowWait("Satellite Detection", cleanedMask);

  // 2. Preprocess: Denoise with Median Blur (essential for satellite grain)
  // const gray = img.bgrToGray();
  // cv.imshowWait("Satellite Detection", gray);

  // const alpha = 1.5;
  // const beta = 20;
  // const gray2 = gray.convertTo(-1, alpha, beta);
  // const denoised = gray2.medianBlur(3);
  // // 3. Enhance Contrast (CLAHE)
  // // This makes building edges pop against the ground
  // const highContrast = denoised.equalizeHist();
  // cv.imshowWait("Satellite Detection", highContrast);

  const edges = cleanedMask.canny(100, 200);
  cv.imshowWait("Satellite Detection", edges);

  const output = img.copy();

  // 2. 定义一个结构元素（卷积核）
  // 如果断裂比较严重，可以增加 Size 的数值，比如 (5, 5)
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));

  // 3. 执行闭运算 (MORPH_CLOSE)
  // 它会自动进行 膨胀 -> 腐蚀
  const closedEdges = edges.morphologyEx(
    kernel,
    cv.MORPH_CLOSE,
    new cv.Point2(-1, -1), // 锚点在中心
    2, // 迭代次数，次数越多，连接能力越强
  );

  const contours = closedEdges.findContours(
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );
  console.log("contours", contours.length);

  contours.forEach((contour) => {
    if (contour.area < 400 || contour.numPoints < 5) return;
    // const peri = contour.arcLength(true);
    // const approx = contour.approxPolyDP(0.02 * peri, true);
    const perimeter = contour.arcLength(true);

    /**
     * 2. 進行多邊形逼近 (Polygon Approximation)
     * 關鍵點：epsilon 的設定。
     * 通常設定為周長的 1% 到 5% 之間。
     * 0.02 * perimeter 是一個很好的起點。
     */
    const epsilon = 0.001 * perimeter;
    const approx = contour.approxPolyDP(epsilon, true);

    output.drawContours([approx], -1, getRandomVividColor(), 2);

    // Adjust these numbers based on your satellite resolution (Zoom level)
    // if (area > 200 && area < 5000) {
    //   const peri = contour.arcLength(true);
    //   const approx = contour.approxPolyDP(0.04 * peri, true);
    //   // Check for "Squareness" (Buildings usually have 4 corners)
    //   if (approx.length >= 4 && approx.length <= 8) {
    //     output.drawContours([approx], -1, new cv.Vec3(0, 255, 0), 2);
    //     // const rect = contour.boundingRect();
    //     // Draw a bounding box around the detected building
    //     // img.drawRectangle(rect, new cv.Vec3(0, 255, 0), 2);
    //   }
    // }
  });

  cv.imshowWait("Satellite Detection", output);
}

function getRandomVividColor() {
  return new cv.Vec3(
    60 + Math.floor(Math.random() * 196), // B: 60-255
    60 + Math.floor(Math.random() * 196), // G: 60-255
    60 + Math.floor(Math.random() * 196), // R: 60-255
  );
}

detectSatelliteBuildings().catch((err) => console.error(err));
