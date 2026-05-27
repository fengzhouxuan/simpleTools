const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const core = require("../core/fs.cjs");
const { mapConcurrent, DEFAULT_CONCURRENCY } = require("../core/concurrent.cjs");

// ============================================================
// 设计
// ============================================================
// 默认 sharp 输出会丢失所有元数据 — 这就是我们要的"剥离"。
// 两个细粒度开关：
//   - preserveColorProfile：保留 ICC profile（不保留 = 不同显示器看色彩可能偏移）
//   - preserveOrientation：保留 EXIF Orientation（手机拍的图常用 1/3/6/8 表示旋转，
//     不保留 = 图可能"倒了"，因为像素本身没旋转）
// 不暴露给用户的"自动安全"行为：
//   - 用 quality: 95 + mozjpeg 做 JPG 重编码，尽量减少肉眼可见的二次损失
//   - PNG / GIF 无损通道
//
// 输出格式 = 输入格式（不做转换）。要转格式去用 compress 工具。

// ============================================================
// 单文件处理：返回 CompressionResult 兼容结构（{...file, status, outputPath, outputSize}）
// ============================================================

const SUPPORTED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function buildMetadataOptions(originalMeta, opts) {
  const out = {};
  if (opts.preserveOrientation && originalMeta.orientation) {
    out.orientation = originalMeta.orientation;
  }
  // ICC 控制：sharp 的 withMetadata 默认会保留 ICC profile（如果原图有的话）；
  // 我们通过 'icc: undefined' 显式让它跟原图走；如果不保留色彩，不调 withMetadata（默认全 strip）
  return out;
}

async function resolveSaveTarget(file, saveMode, outputDir) {
  const sourceDir = path.dirname(file.path);
  const name = file.name;

  if (saveMode === "overwrite-source") {
    return { outputPath: file.path, cleanupSource: null };
  }
  const targetDir = saveMode === "custom" ? outputDir : sourceDir;
  return {
    outputPath: await core.resolveOutputPath(targetDir, name, "rename"),
    cleanupSource: null,
  };
}

async function stripOne(file, payload) {
  const ext = path.extname(file.path).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) {
    return {
      ...file,
      status: "failed",
      error: `不支持 ${ext}（仅支持 JPG/PNG/WebP/GIF）`,
    };
  }

  try {
    const meta = await sharp(file.path, { animated: ext === ".gif" }).metadata();

    const metadataOpts = buildMetadataOptions(meta, payload);
    let pipeline = sharp(file.path, { animated: ext === ".gif" });

    if (payload.preserveColorProfile) {
      // withMetadata 默认保留 ICC profile（如果原图有），同时按 metadataOpts 设置 orientation
      pipeline = pipeline.withMetadata(metadataOpts);
    } else if (payload.preserveOrientation && metadataOpts.orientation) {
      // 不保留色彩但保留方向 → 只设 orientation（其他 metadata 仍会被 strip）
      pipeline = pipeline.withMetadata(metadataOpts);
    }
    // else: 完全不调用 withMetadata → 默认 strip 全部元数据

    // 按原格式编码，尽量保留视觉质量
    if (ext === ".png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (ext === ".jpg" || ext === ".jpeg") {
      pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
    } else if (ext === ".webp") {
      pipeline = pipeline.webp({ quality: 95 });
    } else if (ext === ".gif") {
      pipeline = pipeline.gif({ effort: 7, reuse: true });
    }

    const { outputPath } = await resolveSaveTarget(file, payload.saveMode, payload.outputDir);

    // overwrite-source 模式下 outputPath === file.path，sharp 不能边读边写同文件
    // → 先写到临时路径再 rename
    if (outputPath === file.path) {
      const tmpPath = outputPath + ".tmp-strip";
      await pipeline.toFile(tmpPath);
      await fs.rename(tmpPath, outputPath);
    } else {
      await pipeline.toFile(outputPath);
    }

    const stats = await fs.stat(outputPath);
    return {
      ...file,
      name: path.basename(outputPath),
      outputPath,
      outputSize: stats.size,
      ratio: file.size > 0 ? Math.max(0, 1 - stats.size / file.size) : 0,
      status: "done",
    };
  } catch (e) {
    return {
      ...file,
      status: "failed",
      error: e instanceof Error ? e.message : "strip failed",
    };
  }
}

// ============================================================
// 入口
// ============================================================

async function stripMetadata(payload, onProgress) {
  const { files, outputDir, saveMode } = payload;
  if (saveMode === "custom") {
    if (!outputDir) throw new Error("custom 模式需要选输出目录");
    await core.ensureOutputDir(outputDir);
  }
  return mapConcurrent(
    files,
    DEFAULT_CONCURRENCY,
    (file) => stripOne(file, payload),
    onProgress,
  );
}

function register(ipcMain) {
  ipcMain.handle("tools:metadata-strip:run", (event, payload) =>
    stripMetadata(payload, (p) =>
      event.sender.send("tools:metadata-strip:progress", p),
    ),
  );
}

module.exports = {
  stripMetadata,
  register,
  __test__: { buildMetadataOptions, SUPPORTED_EXT },
};
