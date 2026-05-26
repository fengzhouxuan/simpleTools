const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { dialog, shell } = require("electron");

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".svg"]);

// 跳过这些目录的递归扫描：通常含大量非素材文件，误扫会卡死
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  "__MACOSX",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

// 安全阀：避免误选根目录后失控
const MAX_SCAN_FILES = 5000;
const MAX_SCAN_DEPTH = 16;

function isSupportedPath(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalizeFile(filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    id: filePath, // path 在文件系统内天然唯一，足够当 React key
    name: path.basename(filePath),
    path: filePath,
    ext,
    size: stats.size,
    supported: SUPPORTED_EXTENSIONS.has(ext),
  };
}

async function collectFromDirectory(dirPath, options = {}) {
  const { depth = 0, accumulator = [] } = options;
  if (accumulator.length >= MAX_SCAN_FILES) return accumulator;
  if (depth > MAX_SCAN_DEPTH) return accumulator;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return accumulator;
  }

  for (const entry of entries) {
    if (accumulator.length >= MAX_SCAN_FILES) break;
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      await collectFromDirectory(fullPath, { depth: depth + 1, accumulator });
      continue;
    }

    if (!entry.isFile()) continue;
    if (!isSupportedPath(entry.name)) continue;

    try {
      const stats = await fs.stat(fullPath);
      accumulator.push(normalizeFile(fullPath, stats));
    } catch {
      continue;
    }
  }
  return accumulator;
}

async function normalizePaths(paths) {
  const results = [];
  for (const filePath of paths) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || !isSupportedPath(filePath)) continue;
      results.push(normalizeFile(filePath, stats));
    } catch {
      continue;
    }
  }
  return results;
}

async function ensureOutputDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resolveOutputPath(outputDir, fileName, collisionStrategy) {
  const preferredPath = path.join(outputDir, fileName);
  if (collisionStrategy === "overwrite") {
    return preferredPath;
  }
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  let candidatePath = preferredPath;
  let suffix = 1;
  while (fsSync.existsSync(candidatePath)) {
    candidatePath = path.join(outputDir, `${baseName}-${suffix}${ext}`);
    suffix += 1;
  }
  return candidatePath;
}

async function pickFiles() {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "svg"] }],
  });
  if (result.canceled) return [];
  return Promise.all(
    result.filePaths.map(async (filePath) => {
      const stats = await fs.stat(filePath);
      return normalizeFile(filePath, stats);
    }),
  );
}

async function pickFolder() {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function pickSingleFile(filters) {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: Array.isArray(filters) && filters.length > 0 ? filters : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

// 检查一组候选路径，返回第一个实际存在的文件路径（找不到返回 null）
// 用于"猜测同目录同名"这类智能匹配
async function firstExisting(paths) {
  if (!Array.isArray(paths)) return null;
  for (const p of paths) {
    if (!p) continue;
    try {
      const stat = await fs.stat(p);
      if (stat.isFile()) return p;
    } catch {
      // 不存在，继续
    }
  }
  return null;
}

async function scanDirectory(dirPath) {
  return collectFromDirectory(dirPath);
}

async function openPath(filePath) {
  // shell.openPath 返回字符串：空表示成功，非空是错误信息
  const err = await shell.openPath(filePath);
  return err ? { ok: false, error: err } : { ok: true };
}

function revealInFolder(filePath) {
  shell.showItemInFolder(filePath);
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("core:fs:pick-files", () => pickFiles());
  ipcMain.handle("core:fs:pick-folder", () => pickFolder());
  ipcMain.handle("core:fs:pick-single-file", (_e, filters) => pickSingleFile(filters));
  ipcMain.handle("core:fs:first-existing", (_e, paths) => firstExisting(paths));
  ipcMain.handle("core:fs:scan-directory", (_event, dirPath) => scanDirectory(dirPath));
  ipcMain.handle("core:fs:normalize-paths", (_event, paths) => normalizePaths(paths));
  ipcMain.handle("core:fs:open-path", (_event, filePath) => openPath(filePath));
  ipcMain.handle("core:fs:reveal-in-folder", (_event, filePath) => revealInFolder(filePath));
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  isSupportedPath,
  normalizeFile,
  collectFromDirectory,
  normalizePaths,
  ensureOutputDir,
  resolveOutputPath,
  pickFiles,
  pickFolder,
  pickSingleFile,
  firstExisting,
  scanDirectory,
  openPath,
  revealInFolder,
  register,
};
