const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const sharp = require("sharp");
const { MaxRectsPacker } = require("maxrects-packer");
const core = require("../core/fs.cjs");
const atlasPack = require("./atlas-pack.cjs");

// 用 frame.name（即文件名）当 entity id；hash 决定"内容是否变了"。
// 输入的新源：路径列表；每个文件的 basename 等价于 entity id。

async function loadNewSourceMeta(newPaths) {
  const list = [];
  for (const p of newPaths) {
    try {
      const stat = await fs.stat(p);
      if (!stat.isFile()) continue;
      const hash = await atlasPack.hashFile(p);
      list.push({ path: p, name: path.basename(p), hash });
    } catch (e) {
      console.error(`[atlas-incremental] skip ${p}:`, e.message);
    }
  }
  return list;
}

function diffSources(oldManifest, newSourcesMeta) {
  const oldByName = new Map(oldManifest.entries.map((e) => [e.name, e]));
  const newByName = new Map(newSourcesMeta.map((s) => [s.name, s]));

  const added = [];
  const modified = [];
  const removed = [];
  const unchanged = [];

  for (const [name, src] of newByName) {
    const old = oldByName.get(name);
    if (!old) {
      added.push(src.path);
    } else if (old.hash !== src.hash) {
      modified.push(src.path);
    } else {
      unchanged.push(name);
    }
  }
  for (const name of oldByName.keys()) {
    if (!newByName.has(name)) removed.push(name);
  }

  return { added, modified, removed, unchanged };
}

// ============================================================
// 把 added + modified 子图打包成附加页（用 MaxRects，独立 bin）
// ============================================================

async function packPatchPages(patchSources, options) {
  if (patchSources.length === 0) {
    return { pages: [] };
  }

  // 复用 atlas-pack 内部 loadInputs / packBins 的逻辑思路：这里直接用 sharp + maxrects
  const loaded = [];
  for (const src of patchSources) {
    try {
      const meta = await sharp(src.path).metadata();
      const sourceWidth = meta.width || 0;
      const sourceHeight = meta.height || 0;

      let effectiveWidth = sourceWidth;
      let effectiveHeight = sourceHeight;
      let trimX = 0;
      let trimY = 0;
      let trimmed = false;

      if (options.trim && meta.hasAlpha) {
        try {
          const { info } = await sharp(src.path)
            .trim()
            .toBuffer({ resolveWithObject: true });
          effectiveWidth = info.width;
          effectiveHeight = info.height;
          trimX = -(info.trimOffsetLeft || 0);
          trimY = -(info.trimOffsetTop || 0);
          trimmed =
            trimX !== 0 ||
            trimY !== 0 ||
            effectiveWidth !== sourceWidth ||
            effectiveHeight !== sourceHeight;
        } catch {
          trimmed = false;
        }
      }

      loaded.push({
        path: src.path,
        name: src.name,
        sourceWidth,
        sourceHeight,
        effectiveWidth,
        effectiveHeight,
        trimX,
        trimY,
        trimmed,
      });
    } catch (e) {
      console.error(`[atlas-incremental] load fail ${src.path}:`, e.message);
    }
  }

  const packer = new MaxRectsPacker(
    options.maxWidth,
    options.maxHeight,
    options.padding,
    {
      smart: true,
      pot: options.pot,
      square: false,
      allowRotation: options.allowRotate,
      tag: false,
    },
  );

  packer.addArray(
    loaded.map((it) => ({
      width: it.effectiveWidth,
      height: it.effectiveHeight,
      data: it,
    })),
  );

  const pages = packer.bins.map((bin, pageIdx) => ({
    index: pageIdx,
    width: bin.width,
    height: bin.height,
    frames: bin.rects.map((rect) => {
      const src = rect.data;
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
    }),
  }));

  return { pages };
}

// 合成一页：跟 atlas-pack 完全一样，但避免循环 require 直接重写
async function composePageImage(page, options) {
  const composites = [];
  for (const frame of page.frames) {
    let pipeline = sharp(frame.sourcePath);
    if (options.trim && frame.trimmed) {
      pipeline = pipeline.trim();
    }
    let buffer = await pipeline.toBuffer();
    if (frame.rotated) {
      buffer = await sharp(buffer).rotate(90).toBuffer();
    }
    composites.push({ input: buffer, left: frame.x, top: frame.y });
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
// inspect: 只算 diff，不写盘
// ============================================================

async function readManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error(
      `${path.basename(manifestPath)} 不是合法 JSON。增量打包需要 atlas-pack 导出时生成的 *.manifest.json（而不是 atlas.json 元数据本身）。`,
    );
  }
  // 普通 TexturePacker JSON 通常有 frames + meta，没有 entries/version
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    const looksLikeMetadata =
      manifest && (manifest.frames || manifest.meta?.image);
    throw new Error(
      looksLikeMetadata
        ? `${path.basename(manifestPath)} 看起来是元数据文件（atlas.json/plist 那种），不是 *.manifest.json。请在 atlas-pack 导出目录里找 "<outputName>.manifest.json"。`
        : `${path.basename(manifestPath)} 不是支持的 manifest 格式（缺 version=1 或 entries 字段）。请选 atlas-pack 导出时生成的 *.manifest.json。`,
    );
  }
  return manifest;
}

async function inspectIncremental(payload) {
  const manifest = await readManifest(payload.manifestPath);
  const newSources = await loadNewSourceMeta(payload.newSourcePaths || []);
  const diff = diffSources(manifest, newSources);
  return { diff, manifest: { format: manifest.format, total: manifest.entries.length } };
}

// ============================================================
// export: 输出 patch 页 + 新元数据 + 新 manifest
// ============================================================

async function exportIncremental(payload) {
  const manifestDir = path.dirname(payload.manifestPath);
  const oldManifest = await readManifest(payload.manifestPath);
  const newSources = await loadNewSourceMeta(payload.newSourcePaths);
  const diff = diffSources(oldManifest, newSources);

  await core.ensureOutputDir(payload.outputDir);

  // 1) 拷贝旧 atlas（如果输出目录跟旧目录不同）
  const pageImagePaths = [];
  const pageImageNames = [];
  for (const oldName of oldManifest.pageImageNames) {
    const oldPath = path.join(manifestDir, oldName);
    const newPath = path.join(payload.outputDir, oldName);
    if (oldPath !== newPath) {
      if (!fsSync.existsSync(oldPath)) {
        console.warn(`[atlas-incremental] missing old atlas: ${oldPath}`);
        continue;
      }
      await fs.copyFile(oldPath, newPath);
    }
    pageImagePaths.push(newPath);
    pageImageNames.push(oldName);
  }

  // 2) 打包附加页（added + modified）
  const newSourcesByName = new Map(newSources.map((s) => [s.name, s]));
  const patchSources = [];
  for (const p of diff.added) {
    patchSources.push(newSourcesByName.get(path.basename(p)));
  }
  for (const p of diff.modified) {
    patchSources.push(newSourcesByName.get(path.basename(p)));
  }

  const oldPageCount = oldManifest.pageImageNames.length;
  let patchImagePath = null;
  const patchEntries = [];

  if (patchSources.length > 0) {
    const { pages: patchPages } = await packPatchPages(patchSources, payload);
    for (const page of patchPages) {
      const pageIndex = oldPageCount + page.index;
      const suffix = `-patch-${page.index + 1}`;
      const imageName = `${payload.outputName}${suffix}.png`;
      const imagePath = path.join(payload.outputDir, imageName);

      console.log(
        `[atlas-incremental] patch page ${page.index + 1}: ${page.width}x${page.height}, ${page.frames.length} frames`,
      );

      const buffer = await composePageImage(page, payload);
      await fs.writeFile(imagePath, buffer);
      pageImagePaths.push(imagePath);
      pageImageNames.push(imageName);
      if (!patchImagePath) patchImagePath = imagePath;

      for (const f of page.frames) {
        patchEntries.push({
          name: f.name,
          sourcePath: f.sourcePath,
          hash: newSourcesByName.get(f.name)?.hash || "",
          page: pageIndex,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          rotated: f.rotated,
          trimmed: f.trimmed,
          sourceWidth: f.sourceWidth,
          sourceHeight: f.sourceHeight,
          trimX: f.trimX,
          trimY: f.trimY,
        });
      }
    }
  }

  // 3) 构造新 manifest
  // - unchanged：保留旧 entry（坐标 / 页号 / hash 都不变）
  // - removed：丢弃
  // - modified：删除旧 entry，用新的 patch entry 替换
  // - added：直接加 patch entry
  const removedSet = new Set(diff.removed);
  const modifiedNames = new Set(diff.modified.map((p) => path.basename(p)));
  const survivedOldEntries = oldManifest.entries.filter(
    (e) => !removedSet.has(e.name) && !modifiedNames.has(e.name),
  );

  const newEntries = [...survivedOldEntries, ...patchEntries];

  // 4) 写新元数据（按页拆分）
  const metadataPaths = [];
  for (let p = 0; p < pageImageNames.length; p++) {
    const pageEntries = newEntries.filter((e) => e.page === p);
    if (pageEntries.length === 0) continue;

    // 拼一个最小的 page 结构给 serializeMetadata 用
    const page = {
      index: p,
      width: 0,
      height: 0,
      frames: pageEntries,
    };
    // 真实 page 宽高来自 atlas 图片
    try {
      const meta = await sharp(path.join(payload.outputDir, pageImageNames[p])).metadata();
      page.width = meta.width || 0;
      page.height = meta.height || 0;
    } catch {
      // 拿不到的话写 0，元数据里 size 不准但 frame 坐标是对的
    }

    const metadataStr = atlasPack.serializeMetadata(
      page,
      pageImageNames[p],
      payload.format,
    );
    const ext = atlasPack.metadataExtension(payload.format);
    const metaName = pageImageNames[p].replace(/\.png$/i, `.${ext}`);
    const metaPath = path.join(payload.outputDir, metaName);
    await fs.writeFile(metaPath, metadataStr, "utf8");
    metadataPaths.push(metaPath);
  }

  // 5) 写新 manifest
  const newManifest = {
    version: 1,
    app: "SimpleImageCompress",
    format: payload.format,
    pageImageNames,
    entries: newEntries,
  };
  const manifestOut = path.join(payload.outputDir, `${payload.outputName}.manifest.json`);
  await fs.writeFile(manifestOut, JSON.stringify(newManifest, null, 2), "utf8");

  return {
    diff,
    patchImagePath,
    pageImagePaths,
    metadataPaths,
    manifestPath: manifestOut,
    fellBackToFullRepack: false,
  };
}

// ============================================================
// IPC
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
  diffSources,
  register,
};
