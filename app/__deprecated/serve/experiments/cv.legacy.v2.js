import cv from "@u4/opencv4nodejs";

const extractSeparateBuildings = async (inputPath) => {
  try {
    const img = await cv.imreadAsync(inputPath);
    const hls = await img.cvtColorAsync(cv.COLOR_BGR2HLS);

    // 1. 提取建筑掩码 (L 亮度过滤)
    const lower = new cv.Vec3(0, 145, 0);
    const upper = new cv.Vec3(180, 255, 60);
    let binaryMask = await hls.inRangeAsync(lower, upper);
    await cv.imshowWait("binaryMask.jpg", binaryMask); // 查看拆分后的 Mask

    /**
     * 2. 核心：拆分相连建筑
     * 我们使用腐蚀 (Erosion) 让白色块变小。
     * 迭代次数 (iterations) 越多，拆分得越彻底，但建筑也会越小。
     */
    const kernel = new cv.Mat(3, 3, cv.CV_8U, 1);
    // 先做一次闭运算填补内部小孔
    binaryMask = await binaryMask.morphologyExAsync(kernel, cv.MORPH_CLOSE);

    await cv.imshowWait("binaryMask.jpg", binaryMask); // 查看拆分后的 Mask

    // 执行腐蚀：强行切断建筑间的“细桥”
    // iterations: 2-3 次通常能断开大部分紧凑的建筑
    const erodedMask = await binaryMask.erodeAsync(
      kernel,
      new cv.Point2(-1, -1),
      2,
    );

    await cv.imshowWait("debug_eroded_mask.jpg", erodedMask); // 查看拆分后的 Mask

    // 3. 提取外轮廓
    const contours = await erodedMask.findContoursAsync(
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const outputImg = img.copy();

    contours.forEach((cnt) => {
      // 这里的面积门槛需要调低一点，因为腐蚀后面积变小了
      if (cnt.area > 150) {
        // 4. 获取最小外接矩形
        const minRect = cnt.minAreaRect();

        // 5. 过滤掉马路 (长宽比判断)
        const { width, height } = minRect.size;
        const aspectRatio = Math.max(width, height) / Math.min(width, height);

        if (aspectRatio < 5) {
          // 获取顶点
          const vertices = getRectVertices(minRect);

          /**
           * 6. 补偿缩减：
           * 因为我们之前腐蚀了 2 次，矩形会比实际建筑小一圈。
           * 如果需要更准，可以手动微调 vertices 的坐标向外扩张。
           */
          outputImg.drawContours([vertices], -1, new cv.Vec3(0, 255, 0), 2);
        }
      }
    });

    await cv.imshowWait("separated_buildings.jpg", outputImg);
    console.log("✅ 独立多边形绘制完成！");
  } catch (err) {
    console.error("❌ Error:", err);
  }
};

const getRectVertices = (rotatedRect) => {
  const { center, size, angle } = rotatedRect;
  const width = size.width;
  const height = size.height;

  // 角度轉弧度
  const theta = (angle * Math.PI) / 180.0;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const v = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  return v.map(
    (p) =>
      new cv.Point2(
        center.x + p.x * cosTheta - p.y * sinTheta,
        center.y + p.x * sinTheta + p.y * cosTheta,
      ),
  );
};

extractSeparateBuildings("./Screenshot.jpg");
