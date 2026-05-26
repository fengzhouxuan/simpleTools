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
//   1. 拆旧 atlas 到临时目录（带缓存，同一对 atlas+metadata 只拆一次）
//   2. 合并：未被新散图覆盖的旧子图 + 全部新散图
//   3. 用 atlas-pack.exportAtlas 全量重打
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
// 2) 拆图到临时目录（核心）
// ============================================================

async function extractOldFramesToTmpDir(atlasPath, frames, tmpDir, onProgress) {
  const atlasBuffer = await fs.readFile(atlasPath);
  const out = [];
  const total = frames.length;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    onProgress?.({ current: i, total, stage: `拆出 ${frame.name}` });
    try {
      let pipeline = sharp(atlasBuffer).extract({
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
      });
      if (frame.rotated) {
        pipeline = pipeline.rotate(-90);
      }
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
// 3) 拆图单项缓存：避免参数变化时重复拆
// ============================================================
// 切换 atlas/metadata → 清旧 cache、重新拆
// 同一对 atlas+metadata → 直接复用，预览/导出共享

let extractCache = null; // { key, tmpDir, extracted, oldFrames, format }

async function clearCache() {
  if (extractCache) {
    const oldTmp = extractCache.tmpDir;
    extractCache = null;
    fs.rm(oldTmp, { recursive: true, force: true }).catch((e) => {
      console.error(`[atlas-incremental] cleanup ${oldTmp} failed:`, e.message);
    });
  }
}

async function getOrExtract(atlasPath, metadataPath, onProgress) {
  const key = `${atlasPath}|${metadataPath}`;
  if (extractCache && extractCache.key === key) {
    return extractCache;
  }
  if (extractCache) {
    await clearCache();
  }
  const { format, frames } = await loadOldFrames(atlasPath, metadataPath);
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "simpleimage-atlas-merge-"),
  );
  console.log(`[atlas-incremental] tmp dir: ${tmpDir}`);
  const startedAt = Date.now();
  const extracted = await extractOldFramesToTmpDir(
    atlasPath,
    frames,
    tmpDir,
    onProgress,
  );
  console.log(
    `[atlas-incremental] extracted ${extracted.length} frames in ${Date.now() - startedAt}ms`,
  );
  extractCache = { key, tmpDir, extracted, oldFrames: frames, format };
  return extractCache;
}

// ============================================================
// 4) 合并旧子图 + 新散图（新散图覆盖同名）
// ============================================================

function mergeInputs(extracted, newSourcePaths) {
  const newSourceByName = new Map(
    (newSourcePaths || []).map((p) => [path.basename(p), p]),
  );
  const merged = [];
  for (const old of extracted) {
    if (!newSourceByName.has(old.name)) {
      merged.push({ path: old.path, name: old.name });
    }
  }
  for (const newPath of newSourcePaths || []) {
    merged.push({ path: newPath, name: path.basename(newPath) });
  }
  return merged;
}

function computeDiff(oldFrames, newSourcePaths) {
  const oldNames = new Set(oldFrames.map((f) => f.name));
  const newNames = (newSourcePaths || []).map((p) => path.basename(p));
  const modified = newNames.filter((n) => oldNames.has(n));
  const added = newNames.filter((n) => !oldNames.has(n));
  const unchanged = [...oldNames].filter((n) => !newNames.includes(n));
  return { added, modified, removed: [], unchanged };
}

// ============================================================
// 5) preview: 算坐标 + diff，不写盘
// ============================================================

async function previewIncremental(payload) {
  if (!payload.atlasPath || !payload.metadataPath) {
    return {
      diff: { added: [], modified: [], removed: [], unchanged: [] },
      packResult: { pages: [], totalUtilization: 0 },
      manifest: null,
    };
  }

  const { extracted, oldFrames, format } = await getOrExtract(
    payload.atlasPath,
    payload.metadataPath,
  );
  const merged = mergeInputs(extracted, payload.newSourcePaths);
  const packResult = await atlasPack.packAtlas({
    inputs: merged,
    maxWidth: payload.maxWidth,
    maxHeight: payload.maxHeight,
    padding: payload.padding,
    allowRotate: payload.allowRotate,
    pot: payload.pot,
    trim: payload.trim,
  });
  const diff = computeDiff(oldFrames, payload.newSourcePaths);

  return {
    diff,
    packResult,
    manifest: { format, total: oldFrames.length },
  };
}

// ============================================================
// 6) export: 全量重打 + 写盘（复用 cache）
// ============================================================

async function exportIncremental(payload, onProgress) {
  if (!payload.atlasPath || !payload.metadataPath) {
    throw new Error("需要同时选择旧 atlas 图片和旧元数据文件");
  }

  // 拆图阶段：进度按"frame 数"汇报
  const { extracted, oldFrames } = await getOrExtract(
    payload.atlasPath,
    payload.metadataPath,
    (p) => onProgress?.({ ...p, stage: `拆旧图集：${p.stage}` }),
  );
  const merged = mergeInputs(extracted, payload.newSourcePaths);

  // 重打阶段：透传 atlas-pack 的进度，prefix 一下
  const packed = await atlasPack.exportAtlas(
    {
      inputs: merged,
      maxWidth: payload.maxWidth,
      maxHeight: payload.maxHeight,
      padding: payload.padding,
      allowRotate: payload.allowRotate,
      pot: payload.pot,
      trim: payload.trim,
      outputDir: payload.outputDir,
      outputName: payload.outputName,
      format: payload.format,
    },
    (p) => onProgress?.({ ...p, stage: `重打：${p.stage}` }),
  );

  return {
    diff: computeDiff(oldFrames, payload.newSourcePaths),
    patchImagePath: null,
    pageImagePaths: packed.pageImagePaths,
    metadataPaths: packed.metadataPaths,
    manifestPath: packed.manifestPath,
    fellBackToFullRepack: false,
  };
}

// ============================================================
// 7) IPC
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:atlas-incremental:preview", (_e, payload) =>
    previewIncremental(payload),
  );
  ipcMain.handle("tools:atlas-incremental:export", (event, payload) =>
    exportIncremental(payload, (p) =>
      event.sender.send("tools:atlas-incremental:progress", p),
    ),
  );
  ipcMain.handle("tools:atlas-incremental:clear-cache", () => clearCache());
}

module.exports = {
  previewIncremental,
  exportIncremental,
  clearCache,
  register,
};
