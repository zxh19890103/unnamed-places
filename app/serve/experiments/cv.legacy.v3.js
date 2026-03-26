import cv from "@u4/opencv4nodejs";

const captureShadows = async (inputPath) => {
  try {
    const img = await cv.imreadAsync(inputPath);

    const grey = img.bgrToGray();
    await cv.imshowWait("grey.jpg", grey);
    const bw = grey.threshold(30, 255, cv.THRESH_BINARY_INV);
    await cv.imshowWait("bw.jpg", bw);

    // 1. 轉到 HLS 空間
    const hls = await img.cvtColorAsync(cv.COLOR_BGR2HSV);

    const lowerShadow = new cv.Vec3(0, 0, 0); // H, S, V
    const upperShadow = new cv.Vec3(180, 45, 60);
    let shadowMask = await hls.inRangeAsync(lowerShadow, upperShadow);
    await cv.imshowWait("shadow_mask_only.jpg", shadowMask);

    // 3. 形態學清理
    // 閉運算 (CLOSE)：把陰影裡的小亮點（噪點）填平，讓陰影塊更完整
    const kernel = new cv.Mat(3, 3, cv.CV_8U, 1);
    shadowMask = await shadowMask.morphologyExAsync(kernel, cv.MORPH_CLOSE);

    await cv.imshowWait("shadow_mask_only.jpg", shadowMask);

    // 4. 提取陰影輪廓並簡化為四邊形
    const contours = await shadowMask.findContoursAsync(
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const outputImg = img.copy();

    contours.forEach((cnt) => {
      // 面積過濾：太小的可能是車影或樹影，我們只要建築的大陰影
      if (cnt.area > 100) {
        const minRect = cnt.minAreaRect();

        // 使用我們之前討論過的 getPoints() 獲取四個頂點
        // 注意：如果你的版本不支持，請使用我提供的 getRectVertices 手動函數

        // 如果 getPoints 不存在，手動計算
        const { center, size, angle } = minRect;
        const rotate = (angle * Math.PI) / 180;
        const b = Math.cos(rotate) * 0.5;
        const a = Math.sin(rotate) * 0.5;
        const v = [
          new cv.Point2(
            center.x - a * size.height - b * size.width,
            center.y + b * size.height - a * size.width,
          ),
          new cv.Point2(
            center.x + a * size.height - b * size.width,
            center.y - b * size.height - a * size.width,
          ),
          new cv.Point2(
            center.x + a * size.height + b * size.width,
            center.y - b * size.height + a * size.width,
          ),
          new cv.Point2(
            center.x - a * size.height + b * size.width,
            center.y + b * size.height + a * size.width,
          ),
        ];

        outputImg.drawContours([v], -1, new cv.Vec3(255, 0, 0), 2);
      }
    });

    await cv.imshowWait("captured_shadows.jpg", outputImg);
    console.log("✅ 陰影捕捉完成！查看 captured_shadows.jpg");
  } catch (err) {
    console.error("❌ 出錯:", err);
  }
};

captureShadows("./Screenshot.jpg");
