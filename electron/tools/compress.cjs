const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { optimize } = require("svgo");
const core = require("../core/fs.cjs");

const MIN_TARGET_QUALITY = 20;
const RASTER_OUTPUT_FORMATS = new Set(["original", "jpg", "png", "webp"]);
// libvips GIF effort 1~10，默认 7。effort=9~10 对动画 GIF 耗时翻倍且对画质几乎无收益。
const GIF_EFFORT = 7;

function normalizeResizeOptions(resizeOptions) {
  const width = Number(resizeOptions?.width) || 0;
  const height = Number(resizeOptions?.height) || 0;
  const preserveAspect = resizeOptions?.preserveAspect !== false;
  const resizeMode = resizeOptions?.resizeMode === "stretch" ? "stretch" : "crop";

  return {
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
    preserveAspect,
    resizeMode,
  };
}

function applyResizeOptions(image, resizeOptions) {
  const normalized = normalizeResizeOptions(resizeOptions);
  if (!normalized.width && !normalized.height) {
    return image;
  }

  return image.resize({
    width: normalized.width,
    height: normalized.height,
    fit: normalized.preserveAspect ? "inside" : normalized.resizeMode === "crop" ? "cover" : "fill",
    withoutEnlargement: false,
  });
}

function isRasterExtension(ext) {
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".gif";
}

function resolveRasterOutputExtension(inputExt, outputFormat) {
  if (outputFormat === "original") {
    return inputExt === ".jpeg" ? ".jpg" : inputExt;
  }

  if (inputExt === ".gif") {
    return ".gif";
  }

  if (outputFormat === "jpg") {
    return ".jpg";
  }

  if (outputFormat === "png") {
    return ".png";
  }

  if (outputFormat === "webp") {
    return ".webp";
  }

  throw new Error(`Unsupported output format: ${outputFormat}`);
}

function replaceExtension(fileName, nextExt) {
  return `${path.basename(fileName, path.extname(fileName))}${nextExt}`;
}

async function resolveSaveTarget(file, nextName, outputDir, saveMode) {
  const sourceDir = path.dirname(file.path);

  if (saveMode === "overwrite-source") {
    const overwritePath = path.join(sourceDir, nextName);
    return {
      outputPath: overwritePath,
      cleanupSource: overwritePath !== file.path ? file.path : null,
    };
  }

  const targetDir = saveMode === "custom" ? outputDir : sourceDir;
  return {
    outputPath: await core.resolveOutputPath(targetDir, nextName, "rename"),
    cleanupSource: null,
  };
}

async function encodeRasterWithFormat(inputPath, outputFormat, quality, resizeOptions) {
  const image = applyResizeOptions(
    sharp(inputPath, { animated: outputFormat === ".gif" }),
    resizeOptions,
  );

  if (outputFormat === ".jpg" || outputFormat === ".jpeg") {
    return image.jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (outputFormat === ".png") {
    return image.png({ quality, compressionLevel: 9, palette: true }).toBuffer();
  }

  if (outputFormat === ".webp") {
    return image.webp({ quality }).toBuffer();
  }

  if (outputFormat === ".gif") {
    const colours = Math.max(32, Math.min(256, Math.round((quality / 100) * 256)));
    return image.gif({ colours, effort: GIF_EFFORT, dither: 0.9, reuse: true }).toBuffer();
  }

  throw new Error(`Unsupported raster type: ${outputFormat}`);
}

async function compressRaster(inputPath, outputPath, ext, quality, resizeOptions) {
  const output = await encodeRasterWithFormat(inputPath, ext, quality, resizeOptions);
  await fs.writeFile(outputPath, output);
}

async function compressRasterToTargetSize(
  inputPath,
  outputPath,
  ext,
  targetBytes,
  fallbackQuality,
  resizeOptions,
) {
  if (ext === ".gif") {
    return compressGifToTargetSize(inputPath, outputPath, targetBytes, fallbackQuality, resizeOptions);
  }

  let low = MIN_TARGET_QUALITY;
  let high = 95;
  let bestBuffer = null;
  let bestQuality = fallbackQuality;
  let bestSize = Number.POSITIVE_INFINITY;

  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const buffer = await encodeRasterWithFormat(inputPath, ext, quality, resizeOptions);
    const size = buffer.byteLength;

    if (size < bestSize) {
      bestBuffer = buffer;
      bestQuality = quality;
      bestSize = size;
    }

    if (size <= targetBytes) {
      bestBuffer = buffer;
      bestQuality = quality;
      bestSize = size;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  if (!bestBuffer) {
    bestBuffer = await encodeRasterWithFormat(inputPath, ext, fallbackQuality, resizeOptions);
    bestQuality = fallbackQuality;
    bestSize = bestBuffer.byteLength;
  }

  await fs.writeFile(outputPath, bestBuffer);

  return {
    actualSize: bestSize,
    appliedQuality: bestQuality,
    targetMet: bestSize <= targetBytes,
  };
}

async function compressGifToTargetSize(
  inputPath,
  outputPath,
  targetBytes,
  fallbackQuality,
  resizeOptions,
) {
  let low = 16;
  let high = 256;
  let bestBuffer = null;
  let bestColours = Math.max(32, Math.min(256, Math.round((fallbackQuality / 100) * 256)));
  let bestSize = Number.POSITIVE_INFINITY;

  while (low <= high) {
    const colours = Math.floor((low + high) / 2);
    const buffer = await applyResizeOptions(
      sharp(inputPath, { animated: true }),
      resizeOptions,
    )
      .gif({ colours, effort: GIF_EFFORT, dither: 0.9, reuse: true })
      .toBuffer();
    const size = buffer.byteLength;

    if (size < bestSize) {
      bestBuffer = buffer;
      bestColours = colours;
      bestSize = size;
    }

    if (size <= targetBytes) {
      bestBuffer = buffer;
      bestColours = colours;
      bestSize = size;
      low = colours + 1;
    } else {
      high = colours - 1;
    }
  }

  if (!bestBuffer) {
    bestBuffer = await encodeRasterWithFormat(inputPath, ".gif", fallbackQuality, resizeOptions);
    bestSize = bestBuffer.byteLength;
  }

  await fs.writeFile(outputPath, bestBuffer);

  return {
    actualSize: bestSize,
    appliedColours: bestColours,
    targetMet: bestSize <= targetBytes,
  };
}

async function compressSvg(inputPath, outputPath) {
  const source = await fs.readFile(inputPath, "utf8");
  const result = optimize(source, {
    path: inputPath,
    multipass: true,
  });
  await fs.writeFile(outputPath, result.data, "utf8");
}

async function compressImages(payload, onProgress) {
  const {
    files,
    outputDir,
    quality = 82,
    mode = "quality",
    targetSizeKB = 0,
    outputFormat = "original",
    saveMode = "source",
    resizeOptions = {},
  } = payload;

  if (saveMode === "custom") {
    await core.ensureOutputDir(outputDir);
  }

  const results = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({ current: i, total, stage: `压缩 ${file.name}` });
    const ext = path.extname(file.path).toLowerCase();
    const normalizedOutputFormat = RASTER_OUTPUT_FORMATS.has(outputFormat) ? outputFormat : "original";
    const nextExt = isRasterExtension(ext)
      ? resolveRasterOutputExtension(ext, normalizedOutputFormat)
      : ".svg";
    const nextName = replaceExtension(file.name, nextExt);
    const { outputPath, cleanupSource } = await resolveSaveTarget(
      file,
      nextName,
      outputDir,
      saveMode,
    );

    const startedAt = Date.now();
    console.log(`[compress] start ${file.name} (${ext}, ${(file.size / 1024).toFixed(1)} KB)`);

    try {
      if (ext === ".svg") {
        if (normalizedOutputFormat !== "original") {
          throw new Error("SVG 当前仅支持导出为 SVG");
        }
        await compressSvg(file.path, outputPath);
      } else if (ext === ".gif" && normalizedOutputFormat !== "original") {
        throw new Error("GIF 当前仅支持保持为 GIF");
      } else if (mode === "target-size" && targetSizeKB > 0) {
        await compressRasterToTargetSize(
          file.path,
          outputPath,
          nextExt,
          Math.round(targetSizeKB * 1024),
          quality,
          resizeOptions,
        );
      } else {
        await compressRaster(file.path, outputPath, nextExt, quality, resizeOptions);
      }

      if (cleanupSource) {
        await fs.unlink(cleanupSource).catch(() => {});
      }

      const stats = await fs.stat(outputPath);
      console.log(
        `[compress] done  ${file.name} → ${(stats.size / 1024).toFixed(1)} KB in ${Date.now() - startedAt}ms`,
      );
      results.push({
        ...file,
        name: path.basename(outputPath),
        outputPath,
        outputSize: stats.size,
        ratio: file.size > 0 ? Math.max(0, 1 - stats.size / file.size) : 0,
        status: "done",
      });
    } catch (error) {
      console.error(
        `[compress] fail  ${file.name} after ${Date.now() - startedAt}ms:`,
        error instanceof Error ? error.message : error,
      );
      results.push({
        ...file,
        status: "failed",
        error: error instanceof Error ? error.message : "Compression failed",
      });
    }
  }

  onProgress?.({ current: total, total, stage: "完成" });
  return results;
}

function register(ipcMain) {
  ipcMain.handle("tools:compress:run", (event, payload) =>
    compressImages(payload, (p) =>
      event.sender.send("tools:compress:progress", p),
    ),
  );
}

module.exports = {
  compressImages,
  register,
  // 暴露纯函数给单元测试用
  __test__: {
    resolveRasterOutputExtension,
    replaceExtension,
    isRasterExtension,
    normalizeResizeOptions,
  },
};
