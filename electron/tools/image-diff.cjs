const sharp = require("sharp");

// 像素级 diff：
// 1) 两张图都 resize 到统一尺寸（取较大方），缺失区域用透明填充
// 2) 拿 raw RGBA buffer，遍历像素算 max channel delta
// 3) delta > threshold 的像素染红，否则保留 A 的灰度（让用户能看出原图轮廓）
// 4) 输出统计 + base64 PNG（渲染层直接 data URI 展示）

async function diffImages(payload) {
  const { aPath, bPath, threshold = 5 } = payload || {};
  if (!aPath || !bPath) {
    throw new Error("需要同时提供 aPath 和 bPath");
  }

  const aMeta = await sharp(aPath).metadata();
  const bMeta = await sharp(bPath).metadata();
  const aSize = { w: aMeta.width || 0, h: aMeta.height || 0 };
  const bSize = { w: bMeta.width || 0, h: bMeta.height || 0 };
  const w = Math.max(aSize.w, bSize.w);
  const h = Math.max(aSize.h, bSize.h);
  if (w === 0 || h === 0) {
    throw new Error("源图尺寸无效");
  }

  // 上限保护：超过 4096 时缩放后再比，避免内存爆炸（diff 可视化对小尺寸更直观）
  const MAX_SIDE = 4096;
  let cw = w;
  let ch = h;
  if (w > MAX_SIDE || h > MAX_SIDE) {
    const scale = Math.min(MAX_SIDE / w, MAX_SIDE / h);
    cw = Math.round(w * scale);
    ch = Math.round(h * scale);
  }

  const aRaw = await sharp(aPath)
    .resize(cw, ch, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const bRaw = await sharp(bPath)
    .resize(cw, ch, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (aRaw.length !== bRaw.length) {
    throw new Error(
      `内部错误：raw buffer 长度不一致（${aRaw.length} vs ${bRaw.length}）`,
    );
  }

  const diffRaw = Buffer.alloc(aRaw.length);
  let diffPixels = 0;
  let maxDelta = 0;
  let sumDelta = 0;
  const totalPixels = cw * ch;

  for (let i = 0; i < aRaw.length; i += 4) {
    const dr = Math.abs(aRaw[i] - bRaw[i]);
    const dg = Math.abs(aRaw[i + 1] - bRaw[i + 1]);
    const db = Math.abs(aRaw[i + 2] - bRaw[i + 2]);
    const da = Math.abs(aRaw[i + 3] - bRaw[i + 3]);
    const delta = Math.max(dr, dg, db, da);
    sumDelta += delta;
    if (delta > maxDelta) maxDelta = delta;

    if (delta > threshold) {
      // 红色高亮，强度跟 delta 成正比
      diffRaw[i] = 255;
      diffRaw[i + 1] = 0;
      diffRaw[i + 2] = 0;
      diffRaw[i + 3] = Math.min(255, 128 + delta);
      diffPixels++;
    } else {
      // 保留 A 的灰度版本作为"背景"，让用户能看到原图轮廓
      const gray = Math.round(
        (aRaw[i] * 0.299 + aRaw[i + 1] * 0.587 + aRaw[i + 2] * 0.114) * 0.4,
      );
      diffRaw[i] = gray;
      diffRaw[i + 1] = gray;
      diffRaw[i + 2] = gray;
      diffRaw[i + 3] = Math.round((aRaw[i + 3] / 255) * 180);
    }
  }

  const diffPngBuffer = await sharp(diffRaw, {
    raw: { width: cw, height: ch, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const diffImageDataUri = `data:image/png;base64,${diffPngBuffer.toString("base64")}`;

  return {
    stats: {
      comparedWidth: cw,
      comparedHeight: ch,
      totalPixels,
      diffPixels,
      diffRatio: totalPixels > 0 ? diffPixels / totalPixels : 0,
      maxDelta,
      avgDelta: totalPixels > 0 ? sumDelta / totalPixels : 0,
      sizesMatch: aSize.w === bSize.w && aSize.h === bSize.h,
      aSize,
      bSize,
    },
    diffImageDataUri,
  };
}

function register(ipcMain) {
  ipcMain.handle("tools:image-diff:run", (_e, payload) => diffImages(payload));
}

module.exports = { diffImages, register };
