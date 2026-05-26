const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const atlasPack = require("./atlas-pack.cjs");
const atlasUnpack = require("./atlas-unpack.cjs");

// ============================================================
// 设计：merge 模式
// ============================================================
// 用户输入：旧 atlas 图片 + 旧元数据 + 新散图
// 工具流程：
//   1. 解析旧元数据 → 拿到所有旧 frame 在 atlas 中的位置
//   2. 用 sharp.extract 把每个旧 frame 切出到临时目录（按 frame.name 命名）
//   3. 把新散图加进来 — 按文件名 basename 去重，新散图优先（覆盖同名）
//   4. 用 atlas-pack 的 exportAtlas 全量重打
//   5. 清理临时目录
// 输出：单张完整新 atlas + 元数据，子图坐标全新

// ============================================================
// 1) 解析旧元数据
// ============================================================

async function loadOldFrames(atlasPath, metadataPath) {
  const metaContent = await fs.readFile(metadataPath, "utf8");
  const format = atlasUnpack.detectFormat(metadataPath, metaContent);
  const parsed = atlasUnpack.parseMetadata(metaContent, format);
  return { format, frames: parsed.frames };
}

// ============================================================
// 2) 从旧 atlas 切出每个 frame 到临时目录
// ============================================================

async function extractOldFramesToTmpDir(atlasPath, frames, tmpDir) {
  const atlasBuffer = await fs.readFile(atlasPath);
  const out = [];
  for (const frame of frames) {
    try {
      let pipeline = sharp(atlasBuffer).extract({
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
      });
      // 还原 rotate：打包时 90° 顺时针 → 这里 -90° 还原
      if (frame.rotated) {
        pipeline = pipeline.rotate(-90);
      }
      // 不还原 trim：buffer 就是子图实际内容，下一轮 pack 再 trim 也无可去边
      // 名字保留原 frame.name（可能含子目录，例如 "ui/btn.png"）
      const cleanName = frame.name.replace(/\.\./g, "_").replace(/^\/+/, "");
      const outPath = path.join(tmpDir, cleanName);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await pipeline.png().toFile(outPath);
      out.push({ path: outPath, name: cleanName });
    } catch (e) {
      console.error(`[atlas-incremental] extract failed ${frame.name}:`, e.message);
    }
  }
  return out;
}

// ============================================================
// 3) inspect: 算 diff（merge 语义）
// ============================================================

async function inspectIncremental(payload) {
  if (!payload.atlasPath || !payload.metadataPath) {
    throw new Error("需要同时选择旧 atlas 图片和旧元数据文件");
  }
  const { format, frames: oldFrames } = await loadOldFrames(
    payload.atlasPath,
    payload.metadataPath,
  );
  const oldNames = new Set(oldFrames.map((f) => f.name));
  const newNames = (payload.newSourcePaths || []).map((p) => path.basename(p));

  const modified = [];
  const added = [];
  for (const n of newNames) {
    if (oldNames.has(n)) modified.push(n);
    else added.push(n);
  }
  const unchanged = [...oldNames].filter((n) => !newNames.includes(n));

  return {
    diff: { added, modified, removed: [], unchanged },
    manifest: { format, total: oldFrames.length, fallback: false },
  };
}

// ============================================================
// 4) export: merge + 全量重打
// ============================================================

async function exportIncremental(payload) {
  if (!payload.atlasPath || !payload.metadataPath) {
    throw new Error("需要同时选择旧 atlas 图片和旧元数据文件");
  }

  const { frames: oldFrames } = await loadOldFrames(
    payload.atlasPath,
    payload.metadataPath,
  );

  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "simpleimage-atlas-merge-"),
  );
  console.log(`[atlas-incremental] tmp dir: ${tmpDir}`);

  try {
    // 1. 拆旧 atlas 到临时目录
    const startedAt = Date.now();
    const oldExtracted = await extractOldFramesToTmpDir(
      payload.atlasPath,
      oldFrames,
      tmpDir,
    );
    console.log(
      `[atlas-incremental] extracted ${oldExtracted.length} old frames in ${Date.now() - startedAt}ms`,
    );

    // 2. 合并：新散图覆盖同名旧子图
    const newSourceByName = new Map(
      (payload.newSourcePaths || []).map((p) => [path.basename(p), p]),
    );
    const mergedInputs = [];
    // 未被新散图覆盖的旧子图
    for (const old of oldExtracted) {
      if (!newSourceByName.has(old.name)) {
        mergedInputs.push({ path: old.path, name: old.name });
      }
    }
    // 加入全部新散图
    for (const newPath of payload.newSourcePaths || []) {
      mergedInputs.push({ path: newPath, name: path.basename(newPath) });
    }

    console.log(
      `[atlas-incremental] merging ${oldExtracted.length} old + ${
        (payload.newSourcePaths || []).length
      } new → ${mergedInputs.length} inputs`,
    );

    // 3. 全量重打（复用 atlas-pack）
    const packed = await atlasPack.exportAtlas({
      inputs: mergedInputs,
      maxWidth: payload.maxWidth,
      maxHeight: payload.maxHeight,
      padding: payload.padding,
      allowRotate: payload.allowRotate,
      pot: payload.pot,
      trim: payload.trim,
      outputDir: payload.outputDir,
      outputName: payload.outputName,
      format: payload.format,
    });

    // 4. 算出 diff 给前端展示
    const oldNames = new Set(oldFrames.map((f) => f.name));
    const newNames = (payload.newSourcePaths || []).map((p) => path.basename(p));
    const modified = newNames.filter((n) => oldNames.has(n));
    const added = newNames.filter((n) => !oldNames.has(n));
    const unchanged = [...oldNames].filter((n) => !newNames.includes(n));

    return {
      diff: { added, modified, removed: [], unchanged },
      patchImagePath: null,                   // merge 模式没有 patch 概念
      pageImagePaths: packed.pageImagePaths,
      metadataPaths: packed.metadataPaths,
      manifestPath: packed.manifestPath,
      fellBackToFullRepack: false,
    };
  } finally {
    // 5. 清理临时目录
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`[atlas-incremental] cleanup tmp failed:`, e.message);
    }
  }
}

// ============================================================
// 5) IPC
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:atlas-incremental:inspect", (_e, payload) =>
    inspectIncremental(payload),
  );
  ipcMain.handle("tools:atlas-incremental:export", (_e, payload) =>
    exportIncremental(payload),
  );
}

module.exports = {
  inspectIncremental,
  exportIncremental,
  register,
};
