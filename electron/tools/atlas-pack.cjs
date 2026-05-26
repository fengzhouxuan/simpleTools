const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { MaxRectsPacker } = require("maxrects-packer");
const core = require("../core/fs.cjs");

// 计算文件内容 sha1（增量打包差异检测用）
async function hashFile(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha1").update(buf).digest("hex");
}

// ============================================================
// 1) loadInputs: 读源图元数据 + 可选 trim 检测
// ============================================================

async function loadInputs(paths, { trim }) {
  const inputs = [];
  for (const p of paths) {
    try {
      const meta = await sharp(p).metadata();
      const sourceWidth = meta.width || 0;
      const sourceHeight = meta.height || 0;

      let effectiveWidth = sourceWidth;
      let effectiveHeight = sourceHeight;
      let trimX = 0;
      let trimY = 0;
      let trimmed = false;

      // 只对有 alpha 的栅格图做 trim 检测
      if (trim && meta.hasAlpha) {
        try {
          const { info } = await sharp(p).trim().toBuffer({ resolveWithObject: true });
          effectiveWidth = info.width;
          effectiveHeight = info.height;
          // sharp 返回的 trimOffsetLeft/Top 是负数，表示从原图左/上裁掉了多少
          trimX = -(info.trimOffsetLeft || 0);
          trimY = -(info.trimOffsetTop || 0);
          trimmed =
            trimX !== 0 ||
            trimY !== 0 ||
            effectiveWidth !== sourceWidth ||
            effectiveHeight !== sourceHeight;
        } catch {
          // 全透明或其他 trim 失败时，保守用原尺寸
          trimmed = false;
        }
      }

      inputs.push({
        path: p,
        name: path.basename(p),
        sourceWidth,
        sourceHeight,
        effectiveWidth,
        effectiveHeight,
        trimX,
        trimY,
        trimmed,
      });
    } catch (e) {
      console.error(`[atlas-pack] skip ${p}:`, e.message);
    }
  }
  return inputs;
}

// ============================================================
// 2) packBins: 调 maxrects-packer 算坐标
// ============================================================

function packBins(loaded, options) {
  const { maxWidth, maxHeight, padding, allowRotate, pot } = options;
  const packer = new MaxRectsPacker(maxWidth, maxHeight, padding, {
    smart: true,
    pot,
    square: false,
    allowRotation: allowRotate,
    tag: false,
  });

  packer.addArray(
    loaded.map((it) => ({
      width: it.effectiveWidth,
      height: it.effectiveHeight,
      data: it,
    })),
  );

  const pages = packer.bins.map((bin, pageIdx) => {
    const frames = bin.rects.map((rect) => {
      const src = rect.data;
      // rect.width/height 是占位尺寸（rot=true 时已交换 wh）
      return {
        name: src.name,
        sourcePath: src.path,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotated: rect.rot || false,
        sourceWidth: src.sourceWidth,
        sourceHeight: src.sourceHeight,
        trimX: src.trimX,
        trimY: src.trimY,
        trimmed: src.trimmed,
      };
    });
    const used = frames.reduce((s, f) => s + f.width * f.height, 0);
    const area = bin.width * bin.height;
    return {
      index: pageIdx,
      width: bin.width,
      height: bin.height,
      frames,
      utilization: area > 0 ? used / area : 0,
    };
  });

  const totalArea = pages.reduce((s, p) => s + p.width * p.height, 0);
  const totalUsed = pages.reduce(
    (s, p) => s + p.frames.reduce((ss, f) => ss + f.width * f.height, 0),
    0,
  );

  return {
    pages,
    totalUtilization: totalArea > 0 ? totalUsed / totalArea : 0,
  };
}

// ============================================================
// 3) packAtlas: 对外 IPC 入口（只算坐标，不写盘，给预览用）
// ============================================================

async function packAtlas(options) {
  if (!options.inputs || options.inputs.length === 0) {
    return { pages: [], totalUtilization: 0 };
  }
  const inputs = await loadInputs(
    options.inputs.map((i) => i.path),
    { trim: !!options.trim },
  );
  return packBins(inputs, options);
}

// ============================================================
// 4) composePageImage: 用 sharp.composite 合成一页 PNG
// ============================================================

async function composePageImage(page, options) {
  const composites = [];
  for (const frame of page.frames) {
    // 先读源图（可能 trim 过）
    let pipeline = sharp(frame.sourcePath);
    if (options.trim && frame.trimmed) {
      pipeline = pipeline.trim();
    }
    let buffer = await pipeline.toBuffer();

    // 再处理旋转（90° 顺时针；后续元数据中 rotated:true 即表示此约定）
    if (frame.rotated) {
      buffer = await sharp(buffer).rotate(90).toBuffer();
    }

    composites.push({
      input: buffer,
      left: frame.x,
      top: frame.y,
    });
  }

  return sharp({
    create: {
      width: page.width,
      height: page.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ============================================================
// 5) serializeMetadata: 4 种元数据格式
// ============================================================

const METADATA_EXTENSIONS = {
  plist: "plist",
  "json-hash": "json",
  "json-array": "json",
  css: "css",
};

function metadataExtension(format) {
  return METADATA_EXTENSIONS[format] || "json";
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// TexturePacker 字段命名约定（被绝大多数引擎沿用）：
//   frame:            子图在图集中的位置和尺寸（不含旋转回正）
//   rotated:          图集中是否被旋转 90°
//   trimmed:          是否做过去边
//   spriteSourceSize: trim 后内容在原图坐标中的位置
//   sourceSize:       原图尺寸

function buildFrameRecord(frame) {
  // 注意：rotated=true 时 frame.width/height 是 atlas 中的占位（已交换）
  // 但 TexturePacker 约定 frame.w/h 是 atlas 中实际占位，所以直接用 frame.width/height
  const atlasW = frame.width;
  const atlasH = frame.height;
  // 内容尺寸（rotated 时还原回未旋转的 wh，等同于 trim 后的 wh）
  const contentW = frame.rotated ? atlasH : atlasW;
  const contentH = frame.rotated ? atlasW : atlasH;
  return {
    frame: { x: frame.x, y: frame.y, w: atlasW, h: atlasH },
    rotated: frame.rotated,
    trimmed: frame.trimmed,
    spriteSourceSize: {
      x: frame.trimX,
      y: frame.trimY,
      w: contentW,
      h: contentH,
    },
    sourceSize: { w: frame.sourceWidth, h: frame.sourceHeight },
  };
}

function serializeJsonHash(page, imageName) {
  const frames = {};
  for (const f of page.frames) {
    frames[f.name] = buildFrameRecord(f);
  }
  const json = {
    frames,
    meta: {
      app: "SimpleImageCompress",
      version: "1.0",
      image: imageName,
      format: "RGBA8888",
      size: { w: page.width, h: page.height },
      scale: "1",
    },
  };
  return JSON.stringify(json, null, 2);
}

function serializeJsonArray(page, imageName) {
  const frames = page.frames.map((f) => ({
    filename: f.name,
    ...buildFrameRecord(f),
  }));
  const json = {
    frames,
    meta: {
      app: "SimpleImageCompress",
      version: "1.0",
      image: imageName,
      format: "RGBA8888",
      size: { w: page.width, h: page.height },
      scale: "1",
    },
  };
  return JSON.stringify(json, null, 2);
}

// Cocos2d-x plist (format 2)：与 cocos2d-x SpriteFrameCache 兼容
function serializePlist(page, imageName) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  );
  lines.push('<plist version="1.0">');
  lines.push("<dict>");

  // frames dict
  lines.push("\t<key>frames</key>");
  lines.push("\t<dict>");
  for (const f of page.frames) {
    const r = buildFrameRecord(f);
    lines.push(`\t\t<key>${escapeXml(f.name)}</key>`);
    lines.push("\t\t<dict>");
    lines.push("\t\t\t<key>frame</key>");
    lines.push(
      `\t\t\t<string>{{${r.frame.x},${r.frame.y}},{${r.frame.w},${r.frame.h}}}</string>`,
    );
    lines.push("\t\t\t<key>offset</key>");
    lines.push(`\t\t\t<string>{0,0}</string>`);
    lines.push("\t\t\t<key>rotated</key>");
    lines.push(`\t\t\t<${r.rotated ? "true" : "false"}/>`);
    lines.push("\t\t\t<key>sourceColorRect</key>");
    lines.push(
      `\t\t\t<string>{{${r.spriteSourceSize.x},${r.spriteSourceSize.y}},{${r.spriteSourceSize.w},${r.spriteSourceSize.h}}}</string>`,
    );
    lines.push("\t\t\t<key>sourceSize</key>");
    lines.push(`\t\t\t<string>{${r.sourceSize.w},${r.sourceSize.h}}</string>`);
    lines.push("\t\t</dict>");
  }
  lines.push("\t</dict>");

  // metadata
  lines.push("\t<key>metadata</key>");
  lines.push("\t<dict>");
  lines.push("\t\t<key>format</key>");
  lines.push("\t\t<integer>2</integer>");
  lines.push("\t\t<key>realTextureFileName</key>");
  lines.push(`\t\t<string>${escapeXml(imageName)}</string>`);
  lines.push("\t\t<key>size</key>");
  lines.push(`\t\t<string>{${page.width},${page.height}}</string>`);
  lines.push("\t\t<key>textureFileName</key>");
  lines.push(`\t\t<string>${escapeXml(imageName)}</string>`);
  lines.push("\t</dict>");

  lines.push("</dict>");
  lines.push("</plist>");
  return lines.join("\n") + "\n";
}

// CSS Sprite：每个 frame 一条 .class { background-position; width; height }
function serializeCss(page, imageName) {
  const lines = [];
  for (const f of page.frames) {
    const cls = f.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
    lines.push(`.sprite-${cls} {`);
    lines.push(`  background-image: url('${imageName}');`);
    lines.push(`  background-position: -${f.x}px -${f.y}px;`);
    lines.push(`  width: ${f.width}px;`);
    lines.push(`  height: ${f.height}px;`);
    lines.push(`}`);
  }
  return lines.join("\n") + "\n";
}

function serializeMetadata(page, imageName, format) {
  switch (format) {
    case "plist":
      return serializePlist(page, imageName);
    case "json-array":
      return serializeJsonArray(page, imageName);
    case "css":
      return serializeCss(page, imageName);
    case "json-hash":
    default:
      return serializeJsonHash(page, imageName);
  }
}

// ============================================================
// 6) exportAtlas: 实际写盘
// ============================================================

async function exportAtlas(payload) {
  const result = await packAtlas(payload);
  if (result.pages.length === 0) {
    return { pageImagePaths: [], metadataPaths: [] };
  }

  await core.ensureOutputDir(payload.outputDir);

  const pageImagePaths = [];
  const metadataPaths = [];
  const pageImageNames = [];
  const multi = result.pages.length > 1;

  for (const page of result.pages) {
    const suffix = multi ? `-${page.index + 1}` : "";
    const imageName = `${payload.outputName}${suffix}.png`;
    const imagePath = path.join(payload.outputDir, imageName);

    const startedAt = Date.now();
    console.log(
      `[atlas-pack] page ${page.index + 1}/${result.pages.length}: ${page.width}x${page.height}, ${page.frames.length} frames, util=${(page.utilization * 100).toFixed(1)}%`,
    );

    const buffer = await composePageImage(page, payload);
    await fs.writeFile(imagePath, buffer);
    pageImagePaths.push(imagePath);
    pageImageNames.push(imageName);

    const metadata = serializeMetadata(page, imageName, payload.format);
    const metaName = `${payload.outputName}${suffix}.${metadataExtension(payload.format)}`;
    const metaPath = path.join(payload.outputDir, metaName);
    await fs.writeFile(metaPath, metadata, "utf8");
    metadataPaths.push(metaPath);

    console.log(
      `[atlas-pack] page ${page.index + 1} written in ${Date.now() - startedAt}ms`,
    );
  }

  // 顺手写 manifest（给后续增量打包用）。失败不阻塞主流程。
  let manifestPath = null;
  try {
    const entries = [];
    for (const page of result.pages) {
      for (const frame of page.frames) {
        const hash = await hashFile(frame.sourcePath).catch(() => "");
        entries.push({
          name: frame.name,
          sourcePath: frame.sourcePath,
          hash,
          page: page.index,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          rotated: frame.rotated,
          trimmed: frame.trimmed,
          sourceWidth: frame.sourceWidth,
          sourceHeight: frame.sourceHeight,
          trimX: frame.trimX,
          trimY: frame.trimY,
        });
      }
    }
    const manifest = {
      version: 1,
      app: "SimpleImageCompress",
      format: payload.format,
      pageImageNames,
      entries,
    };
    manifestPath = path.join(payload.outputDir, `${payload.outputName}.manifest.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (e) {
    console.error("[atlas-pack] manifest write failed:", e.message);
  }

  return { pageImagePaths, metadataPaths, manifestPath };
}

// ============================================================
// 7) IPC 注册
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:atlas-pack:pack", (_e, payload) => packAtlas(payload));
  ipcMain.handle("tools:atlas-pack:export", (_e, payload) => exportAtlas(payload));
}

module.exports = {
  packAtlas,
  exportAtlas,
  serializeMetadata,
  metadataExtension,
  hashFile,
  register,
};
