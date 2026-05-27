const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const core = require("../core/fs.cjs");

// ============================================================
// 设计
// ============================================================
// 输入：成品大图 + 4 个 inset (L/T/R/B) + center_keep
// 输出：裁掉中间冗余的最小代表小图 + 元数据 JSON
//
// 9 块布局（任意 inset 可为 0 自动退化）：
//   ┌─────┬─────────┬─────┐
//   │ TL  │    T    │ TR  │  ← TL/TR 不变形
//   ├─────┼─────────┼─────┤  ← T/B 水平拉伸
//   │  L  │  Center │  R  │  ← L/R 垂直拉伸；Center 双向拉伸
//   ├─────┼─────────┼─────┤
//   │ BL  │    B    │ BR  │
//   └─────┴─────────┴─────┘
//
// 输出尺寸：
//   outW = L + center_keep.x + R
//   outH = T + center_keep.y + B
//
// 中心 / 边带的"代表像素"：取原图对应区域的几何中心点
// （等价于运行时 9-slice 拉伸时 GPU 双线性采样的初始坐标）

// ============================================================
// 工具函数
// ============================================================

function validateInsets(W, H, insets, centerKeep) {
  const { l, t, r, b } = insets;
  if (l < 0 || t < 0 || r < 0 || b < 0) {
    throw new Error("inset 不能为负");
  }
  if (centerKeep.x < 1 || centerKeep.y < 1) {
    throw new Error("centerKeep 至少为 1px");
  }
  if (l + r >= W) {
    throw new Error(`L (${l}) + R (${r}) 必须 < 原图宽 ${W}`);
  }
  if (t + b >= H) {
    throw new Error(`T (${t}) + B (${b}) 必须 < 原图高 ${H}`);
  }
}

// 算输出尺寸（同 inset 一起决定）
function computeOutputSize(insets, centerKeep) {
  const outW = insets.l + centerKeep.x + insets.r;
  const outH = insets.t + centerKeep.y + insets.b;
  return { w: outW, h: outH };
}

// 算节省比：1 - 输出面积 / 原始面积
function computeSavedRatio(originalSize, outputSize) {
  const orig = originalSize.w * originalSize.h;
  if (orig <= 0) return 0;
  const out = outputSize.w * outputSize.h;
  return Math.max(0, 1 - out / orig);
}

// 4 个角的几何中心点（用于从原图取代表像素）
function bandSourceRects(W, H, insets, centerKeep) {
  const { l, t, r, b } = insets;
  const { x: ckx, y: cky } = centerKeep;
  const centerW = W - l - r;
  const centerH = H - t - b;

  // 中心带的代表 patch：取几何中心
  const midX = l + Math.floor((centerW - ckx) / 2);
  const midY = t + Math.floor((centerH - cky) / 2);

  return {
    centerW,
    centerH,
    // 4 角
    tl: { left: 0, top: 0, width: l, height: t },
    tr: { left: W - r, top: 0, width: r, height: t },
    bl: { left: 0, top: H - b, width: l, height: b },
    br: { left: W - r, top: H - b, width: r, height: b },
    // 上/下边带：从中心列取 ckx 宽
    topBand: { left: midX, top: 0, width: ckx, height: t },
    bottomBand: { left: midX, top: H - b, width: ckx, height: b },
    // 左/右边带：从中心行取 cky 高
    leftBand: { left: 0, top: midY, width: l, height: cky },
    rightBand: { left: W - r, top: midY, width: r, height: cky },
    // 中心 patch：从中心取 ckx × cky
    centerPatch: { left: midX, top: midY, width: ckx, height: cky },
    // 大块完整尺寸（用于还原拉伸时的目标尺寸）
    topFull: { left: l, top: 0, width: centerW, height: t },
    bottomFull: { left: l, top: H - b, width: centerW, height: b },
    leftFull: { left: 0, top: t, width: l, height: centerH },
    rightFull: { left: W - r, top: t, width: r, height: centerH },
    centerFull: { left: l, top: t, width: centerW, height: centerH },
  };
}

// ============================================================
// 核心 1：裁切 — 生成最小代表小图 buffer
// ============================================================

async function buildCroppedBuffer(sourcePath, insets, centerKeep) {
  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W === 0 || H === 0) throw new Error("源图尺寸无效");
  validateInsets(W, H, insets, centerKeep);

  const outputSize = computeOutputSize(insets, centerKeep);
  const { l, t, r, b } = insets;
  const { x: ckx, y: cky } = centerKeep;
  const rects = bandSourceRects(W, H, insets, centerKeep);
  const src = sharp(sourcePath); // 共用一个 source pipeline 不行，每次 extract 都要 new 一个

  const composites = [];
  // 4 角：原样
  if (l > 0 && t > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.tl).toBuffer(),
      left: 0,
      top: 0,
    });
  }
  if (r > 0 && t > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.tr).toBuffer(),
      left: l + ckx,
      top: 0,
    });
  }
  if (l > 0 && b > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.bl).toBuffer(),
      left: 0,
      top: t + cky,
    });
  }
  if (r > 0 && b > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.br).toBuffer(),
      left: l + ckx,
      top: t + cky,
    });
  }
  // 上下边带 / 左右边带：取 ckx × t / l × cky 的代表
  if (t > 0 && rects.centerW > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.topBand).toBuffer(),
      left: l,
      top: 0,
    });
  }
  if (b > 0 && rects.centerW > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.bottomBand).toBuffer(),
      left: l,
      top: t + cky,
    });
  }
  if (l > 0 && rects.centerH > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.leftBand).toBuffer(),
      left: 0,
      top: t,
    });
  }
  if (r > 0 && rects.centerH > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.rightBand).toBuffer(),
      left: l + ckx,
      top: t,
    });
  }
  // 中心 patch
  if (rects.centerW > 0 && rects.centerH > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.centerPatch).toBuffer(),
      left: l,
      top: t,
    });
  }

  return sharp({
    create: {
      width: outputSize.w,
      height: outputSize.h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ============================================================
// 核心 2：还原 — 模拟 9-slice 拉伸回原尺寸
// ============================================================
// 用于：1) 误差检测 — 跟原图 diff；2) 预览模式切换 — 让用户对比"原图 vs 还原图"

async function buildRestoredBuffer(sourcePath, insets, centerKeep) {
  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W === 0 || H === 0) throw new Error("源图尺寸无效");
  validateInsets(W, H, insets, centerKeep);

  const { l, t, r, b } = insets;
  const rects = bandSourceRects(W, H, insets, centerKeep);

  const composites = [];
  // 4 角：原样放回原位
  if (l > 0 && t > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.tl).toBuffer(),
      left: 0,
      top: 0,
    });
  }
  if (r > 0 && t > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.tr).toBuffer(),
      left: W - r,
      top: 0,
    });
  }
  if (l > 0 && b > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.bl).toBuffer(),
      left: 0,
      top: H - b,
    });
  }
  if (r > 0 && b > 0) {
    composites.push({
      input: await sharp(sourcePath).extract(rects.br).toBuffer(),
      left: W - r,
      top: H - b,
    });
  }
  // 上下边带：取代表 → 水平拉伸到 centerW
  if (t > 0 && rects.centerW > 0) {
    const seed = await sharp(sourcePath).extract(rects.topBand).toBuffer();
    const stretched = await sharp(seed)
      .resize(rects.centerW, t, { fit: "fill" })
      .toBuffer();
    composites.push({ input: stretched, left: l, top: 0 });
  }
  if (b > 0 && rects.centerW > 0) {
    const seed = await sharp(sourcePath).extract(rects.bottomBand).toBuffer();
    const stretched = await sharp(seed)
      .resize(rects.centerW, b, { fit: "fill" })
      .toBuffer();
    composites.push({ input: stretched, left: l, top: H - b });
  }
  // 左右边带
  if (l > 0 && rects.centerH > 0) {
    const seed = await sharp(sourcePath).extract(rects.leftBand).toBuffer();
    const stretched = await sharp(seed)
      .resize(l, rects.centerH, { fit: "fill" })
      .toBuffer();
    composites.push({ input: stretched, left: 0, top: t });
  }
  if (r > 0 && rects.centerH > 0) {
    const seed = await sharp(sourcePath).extract(rects.rightBand).toBuffer();
    const stretched = await sharp(seed)
      .resize(r, rects.centerH, { fit: "fill" })
      .toBuffer();
    composites.push({ input: stretched, left: W - r, top: t });
  }
  // 中心
  if (rects.centerW > 0 && rects.centerH > 0) {
    const seed = await sharp(sourcePath).extract(rects.centerPatch).toBuffer();
    const stretched = await sharp(seed)
      .resize(rects.centerW, rects.centerH, { fit: "fill" })
      .toBuffer();
    composites.push({ input: stretched, left: l, top: t });
  }

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ============================================================
// 核心 3：还原误差 — 跟原图比对
// ============================================================
// 复用 image-diff 的思路：raw RGBA + max-channel-delta + 红色高亮

const DIFF_THRESHOLD = 5; // 单通道差 ≤ 5 视为"相同"（消除编码舍入噪声）

async function computeRestoreError(sourcePath, insets, centerKeep) {
  const restoredBuffer = await buildRestoredBuffer(
    sourcePath,
    insets,
    centerKeep,
  );

  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;

  const origRaw = await sharp(sourcePath).ensureAlpha().raw().toBuffer();
  const restoredRaw = await sharp(restoredBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (origRaw.length !== restoredRaw.length) {
    throw new Error(
      `内部错误：raw buffer 长度不一致（${origRaw.length} vs ${restoredRaw.length}）`,
    );
  }

  const diffRaw = Buffer.alloc(origRaw.length);
  let diffPixels = 0;
  let maxDelta = 0;
  let sumDelta = 0;
  const totalPixels = W * H;

  for (let i = 0; i < origRaw.length; i += 4) {
    const dr = Math.abs(origRaw[i] - restoredRaw[i]);
    const dg = Math.abs(origRaw[i + 1] - restoredRaw[i + 1]);
    const db = Math.abs(origRaw[i + 2] - restoredRaw[i + 2]);
    const da = Math.abs(origRaw[i + 3] - restoredRaw[i + 3]);
    const delta = Math.max(dr, dg, db, da);
    sumDelta += delta;
    if (delta > maxDelta) maxDelta = delta;

    if (delta > DIFF_THRESHOLD) {
      diffRaw[i] = 255;
      diffRaw[i + 1] = 0;
      diffRaw[i + 2] = 0;
      diffRaw[i + 3] = Math.min(255, 128 + delta);
      diffPixels++;
    } else {
      const gray = Math.round(
        (origRaw[i] * 0.299 +
          origRaw[i + 1] * 0.587 +
          origRaw[i + 2] * 0.114) *
          0.4,
      );
      diffRaw[i] = gray;
      diffRaw[i + 1] = gray;
      diffRaw[i + 2] = gray;
      diffRaw[i + 3] = Math.round((origRaw[i + 3] / 255) * 180);
    }
  }

  const diffPngBuffer = await sharp(diffRaw, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    restoredBuffer,
    diffPngBuffer,
    stats: {
      diffPixels,
      totalPixels,
      diffRatio: totalPixels > 0 ? diffPixels / totalPixels : 0,
      maxDelta,
      avgDelta: totalPixels > 0 ? sumDelta / totalPixels : 0,
    },
  };
}

// ============================================================
// IPC 入口：analyze（防抖触发，给前端实时反馈）
// ============================================================

async function analyze(payload) {
  const { sourcePath, insets, centerKeep } = payload;
  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;

  const outputSize = computeOutputSize(insets, centerKeep);
  const savedRatio = computeSavedRatio({ w: W, h: H }, outputSize);

  const { restoredBuffer, diffPngBuffer, stats } = await computeRestoreError(
    sourcePath,
    insets,
    centerKeep,
  );

  return {
    originalSize: { w: W, h: H },
    outputSize,
    savedRatio,
    restoreError: stats,
    diffImageDataUri: `data:image/png;base64,${diffPngBuffer.toString("base64")}`,
    restoredImageDataUri: `data:image/png;base64,${restoredBuffer.toString("base64")}`,
  };
}

// ============================================================
// IPC 入口：export（用户点导出，落盘）
// ============================================================

async function exportCrop(payload) {
  const { sourcePath, insets, centerKeep, center, outputDir, outputName } =
    payload;
  if (!sourcePath) throw new Error("缺少 sourcePath");
  if (!outputDir) throw new Error("缺少 outputDir");
  if (!outputName) throw new Error("缺少 outputName");

  await core.ensureOutputDir(outputDir);

  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W === 0 || H === 0) throw new Error("源图尺寸无效");
  validateInsets(W, H, insets, centerKeep);

  const croppedBuffer = await buildCroppedBuffer(
    sourcePath,
    insets,
    centerKeep,
  );

  // outputName 是 stem（不带扩展名）
  const cleanStem = String(outputName).replace(/\.(png|jpg|jpeg|webp)$/i, "");
  const imagePath = await core.resolveOutputPath(
    outputDir,
    `${cleanStem}.png`,
    "rename",
  );
  const metaPath = await core.resolveOutputPath(
    outputDir,
    `${cleanStem}.9slice.json`,
    "rename",
  );

  await fs.writeFile(imagePath, croppedBuffer);

  const outputSize = computeOutputSize(insets, centerKeep);
  const metadata = {
    version: 1,
    app: "SimpleImageCompress",
    type: "nine-slice",
    source: {
      name: path.basename(sourcePath),
      width: W,
      height: H,
    },
    cropped: {
      name: path.basename(imagePath),
      width: outputSize.w,
      height: outputSize.h,
    },
    insets,
    centerKeep,
    center, // "stretch" / "tile"，给引擎读
  };
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

  return {
    croppedImagePath: imagePath,
    metadataPath: metaPath,
    originalSize: { w: W, h: H },
    outputSize,
    savedRatio: computeSavedRatio({ w: W, h: H }, outputSize),
  };
}

// ============================================================
// 注册
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:nine-slice-crop:analyze", (_e, payload) =>
    analyze(payload),
  );
  ipcMain.handle("tools:nine-slice-crop:export", (_e, payload) =>
    exportCrop(payload),
  );
}

module.exports = {
  analyze,
  exportCrop,
  buildCroppedBuffer,
  buildRestoredBuffer,
  register,
  __test__: {
    validateInsets,
    computeOutputSize,
    computeSavedRatio,
    bandSourceRects,
  },
};
