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
// 核心抽象：每个维度独立处理为 1~3 段
//   - 近端有切 (L>0 或 T>0)：产生"近段"
//   - 中心可压缩 (size - near - far > 0)：产生"中心代表段"（用 seed 像素代表）
//   - 远端有切 (R>0 或 B>0)：产生"远段"
//
// 输出尺寸 = 各段累加：
//   - 9-slice (4 个 inset 都 >0)        → 3×3 = 9 段，输出 (L+ckx+R) × (T+cky+B)
//   - 横向 3-slice (L=R>0, T=B=0)      → 3×1 = 3 段，输出 (L+ckx+R) × H  ← 保留完整高度
//   - 竖向 3-slice (T=B>0, L=R=0)      → 1×3 = 3 段，输出 W × (T+cky+B)  ← 保留完整宽度
//   - 退化 (全 0)                       → 1×1 = 1 段，输出 W × H（不压）
//
// 引擎运行时：按 insets 划分 9 块，4 角原样、4 边带/中心从 seed 像素拉伸回去

// ============================================================
// 通用：参数校验
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

// ============================================================
// 核心算法 1：裁切分段
// ============================================================
// 给定一个维度 (size)、近端 inset (near)、远端 inset (far)、中心代表种子 (seed)，
// 返回这个维度上的分段表 + 输出总尺寸。
//
// 段表里每段 { srcStart, srcSize, dstStart, dstSize }：
//   srcStart/srcSize = 这段在"原图"上的取样位置
//   dstStart/dstSize = 这段在"输出小图"上的目标位置
//
// 退化：near=far=0 时返回单段 — "整段保留，源 == 目标"。
// 这是统一抽象 — 调用方不需要 if/else 区分 9-slice/3-slice。

function computeCropSegments(size, near, far, seed) {
  if (near === 0 && far === 0) {
    // 此维度未切：完整保留，不压缩
    return {
      outSize: size,
      segments: [
        { srcStart: 0, srcSize: size, dstStart: 0, dstSize: size },
      ],
    };
  }

  // 至少一端有切：产生 1~3 段
  const segments = [];
  let dstCursor = 0;

  if (near > 0) {
    segments.push({
      srcStart: 0,
      srcSize: near,
      dstStart: 0,
      dstSize: near,
    });
    dstCursor = near;
  }

  // 中心代表种子：从可压缩区的几何中心取 seed 像素
  // 等价于运行时 9-slice 拉伸时 GPU 双线性采样的初始坐标
  const compressibleSize = size - near - far;
  const seedSrcStart = near + Math.floor((compressibleSize - seed) / 2);
  segments.push({
    srcStart: seedSrcStart,
    srcSize: seed,
    dstStart: dstCursor,
    dstSize: seed,
  });
  dstCursor += seed;

  if (far > 0) {
    segments.push({
      srcStart: size - far,
      srcSize: far,
      dstStart: dstCursor,
      dstSize: far,
    });
    dstCursor += far;
  }

  return { outSize: dstCursor, segments };
}

// ============================================================
// 核心算法 2：还原分段
// ============================================================
// 给定原图维度，返回从原图取代表种子 + 拉伸回原尺寸的段表。
// 跟裁切算法的差别：中心段的"目标尺寸" = 完整中心宽 (而不是 seed)
//   → 渲染时 resize fit:fill 把 seed 拉到完整中心

function computeRestoreSegments(size, near, far, seed) {
  if (near === 0 && far === 0) {
    return [{ srcStart: 0, srcSize: size, dstStart: 0, dstSize: size }];
  }

  const segments = [];
  if (near > 0) {
    segments.push({
      srcStart: 0,
      srcSize: near,
      dstStart: 0,
      dstSize: near,
    });
  }

  // 中心：取 seed 一小块 → 拉到完整中心区域
  const compressibleSize = size - near - far;
  const seedSrcStart = near + Math.floor((compressibleSize - seed) / 2);
  segments.push({
    srcStart: seedSrcStart,
    srcSize: seed,
    dstStart: near,
    dstSize: compressibleSize,
  });

  if (far > 0) {
    segments.push({
      srcStart: size - far,
      srcSize: far,
      dstStart: near + compressibleSize,
      dstSize: far,
    });
  }

  return segments;
}

// ============================================================
// 派生：输出尺寸 + 节省比
// ============================================================

function computeOutputSize(originalSize, insets, centerKeep) {
  const xSeg = computeCropSegments(
    originalSize.w,
    insets.l,
    insets.r,
    centerKeep.x,
  );
  const ySeg = computeCropSegments(
    originalSize.h,
    insets.t,
    insets.b,
    centerKeep.y,
  );
  return { w: xSeg.outSize, h: ySeg.outSize };
}

function computeSavedRatio(originalSize, outputSize) {
  const orig = originalSize.w * originalSize.h;
  if (orig <= 0) return 0;
  const out = outputSize.w * outputSize.h;
  return Math.max(0, 1 - out / orig);
}

// ============================================================
// 核心 1：裁切 — 输出最小代表小图 buffer
// ============================================================

async function buildCroppedBuffer(sourcePath, insets, centerKeep) {
  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W === 0 || H === 0) throw new Error("源图尺寸无效");
  validateInsets(W, H, insets, centerKeep);

  const xSeg = computeCropSegments(W, insets.l, insets.r, centerKeep.x);
  const ySeg = computeCropSegments(H, insets.t, insets.b, centerKeep.y);

  // 9-slice → 9 段；横向 3-slice → 3 段；竖向 3-slice → 3 段；退化 → 1 段
  const composites = [];
  for (const xs of xSeg.segments) {
    for (const ys of ySeg.segments) {
      const buf = await sharp(sourcePath)
        .extract({
          left: xs.srcStart,
          top: ys.srcStart,
          width: xs.srcSize,
          height: ys.srcSize,
        })
        .toBuffer();
      composites.push({ input: buf, left: xs.dstStart, top: ys.dstStart });
    }
  }

  return sharp({
    create: {
      width: xSeg.outSize,
      height: ySeg.outSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ============================================================
// 核心 2：还原 — 用代表种子模拟运行时 9-slice 拉伸回原尺寸
// ============================================================
// 跟裁切对应：从原图取相同的段（按 RestoreSegments 的源位置），把中心段拉到完整中心
// 用于：1) 误差检测 — 跟原图 diff；2) 还原图预览

async function buildRestoredBuffer(sourcePath, insets, centerKeep) {
  const meta = await sharp(sourcePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W === 0 || H === 0) throw new Error("源图尺寸无效");
  validateInsets(W, H, insets, centerKeep);

  const xSegs = computeRestoreSegments(W, insets.l, insets.r, centerKeep.x);
  const ySegs = computeRestoreSegments(H, insets.t, insets.b, centerKeep.y);

  const composites = [];
  for (const xs of xSegs) {
    for (const ys of ySegs) {
      const extracted = await sharp(sourcePath)
        .extract({
          left: xs.srcStart,
          top: ys.srcStart,
          width: xs.srcSize,
          height: ys.srcSize,
        })
        .toBuffer();
      // 源尺寸 != 目标尺寸 → 中心段，需要 resize 拉伸
      const final =
        xs.srcSize === xs.dstSize && ys.srcSize === ys.dstSize
          ? extracted
          : await sharp(extracted)
              .resize(xs.dstSize, ys.dstSize, { fit: "fill" })
              .toBuffer();
      composites.push({ input: final, left: xs.dstStart, top: ys.dstStart });
    }
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
// 核心 3：还原误差 — 跟原图 raw 像素对比
// ============================================================
// 复用 image-diff 的算法：raw RGBA + max-channel-delta + 红色高亮

const DIFF_THRESHOLD = 5;

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

  const originalSize = { w: W, h: H };
  const outputSize = computeOutputSize(originalSize, insets, centerKeep);
  const savedRatio = computeSavedRatio(originalSize, outputSize);

  const { restoredBuffer, diffPngBuffer, stats } = await computeRestoreError(
    sourcePath,
    insets,
    centerKeep,
  );

  return {
    originalSize,
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

  const originalSize = { w: W, h: H };
  const outputSize = computeOutputSize(originalSize, insets, centerKeep);
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
    center,
  };
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

  return {
    croppedImagePath: imagePath,
    metadataPath: metaPath,
    originalSize,
    outputSize,
    savedRatio: computeSavedRatio(originalSize, outputSize),
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
    computeCropSegments,
    computeRestoreSegments,
    computeOutputSize,
    computeSavedRatio,
  },
};
