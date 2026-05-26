const { app, BrowserWindow, ipcMain } = require("electron");
const fsSync = require("fs");
const path = require("path");
const core = require("./core/fs.cjs");
const settings = require("./core/settings.cjs");
const compress = require("./tools/compress.cjs");
const atlasPack = require("./tools/atlas-pack.cjs");
const atlasUnpack = require("./tools/atlas-unpack.cjs");
const atlasIncremental = require("./tools/atlas-incremental.cjs");

function resolveRendererEntry() {
  const devServerUrl = process.env.SIMPLEIMAGE_DEV_SERVER_URL;
  if (devServerUrl) {
    return { type: "url", value: devServerUrl };
  }

  const distPath = path.join(__dirname, "..", "dist", "index.html");
  return { type: "file", value: distPath };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: "#00000000",
    title: "SimpleImageCompress",
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // 桌面工具需要预览本地图片：允许渲染层加载 file:// 资源
      webSecurity: false,
    },
  });

  // 保留真错误事件：页面加载失败 / 渲染进程崩溃 / preload 报错
  window.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error("[renderer] did-fail-load:", errorCode, errorDescription, validatedURL);
  });
  window.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] render-process-gone:", details);
  });
  window.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error("[renderer] preload-error:", preloadPath, error);
  });

  const entry = resolveRendererEntry();
  if (entry.type === "url") {
    window.loadURL(entry.value);
    if (process.env.SIMPLEIMAGE_DEBUG === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }
    return;
  }

  if (!fsSync.existsSync(entry.value)) {
    throw new Error(`Renderer build not found at ${entry.value}. Run npm run build first.`);
  }

  window.loadFile(entry.value);
}

core.register(ipcMain);
settings.register(ipcMain);
compress.register(ipcMain);
atlasPack.register(ipcMain);
atlasUnpack.register(ipcMain);
atlasIncremental.register(ipcMain);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
