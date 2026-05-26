const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { app } = require("electron");

// 简单 KV 持久化：基于 userData/settings.json，惰性加载 + 内存缓存 + 异步写盘
// 用 namespace 风格的 key，如 "tool:compress:outputDir"

let cache = null;     // 内存对象，null = 未加载
let filePath = null;
let writePromise = Promise.resolve(); // 串行写盘，避免竞态

function getFilePath() {
  if (!filePath) {
    filePath = path.join(app.getPath("userData"), "settings.json");
  }
  return filePath;
}

function ensureLoaded() {
  if (cache !== null) return;
  const p = getFilePath();
  try {
    if (fsSync.existsSync(p)) {
      cache = JSON.parse(fsSync.readFileSync(p, "utf8"));
    } else {
      cache = {};
    }
  } catch (e) {
    console.error("[settings] load failed:", e.message);
    cache = {};
  }
}

function get(key, defaultValue) {
  ensureLoaded();
  return key in cache ? cache[key] : defaultValue;
}

function set(key, value) {
  ensureLoaded();
  cache[key] = value;
  // 串行写盘
  writePromise = writePromise.then(async () => {
    const p = getFilePath();
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(cache, null, 2), "utf8");
    } catch (e) {
      console.error("[settings] write failed:", e.message);
    }
  });
}

function register(ipcMain) {
  ipcMain.handle("core:settings:get", (_e, key, defaultValue) =>
    get(key, defaultValue),
  );
  ipcMain.handle("core:settings:set", (_e, key, value) => {
    set(key, value);
    return true;
  });
}

module.exports = { get, set, register };
