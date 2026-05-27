const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const fsSync = require("fs");
const path = require("path");
const core = require("./core/fs.cjs");
const settings = require("./core/settings.cjs");
const clipboard = require("./core/clipboard.cjs");
const compress = require("./tools/compress.cjs");
const atlasPack = require("./tools/atlas-pack.cjs");
const atlasUnpack = require("./tools/atlas-unpack.cjs");
const atlasIncremental = require("./tools/atlas-incremental.cjs");
const iconGen = require("./tools/icon-gen.cjs");
const imageDiff = require("./tools/image-diff.cjs");
const batchRename = require("./tools/batch-rename.cjs");
const metadataStrip = require("./tools/metadata-strip.cjs");

// macOS 应用菜单：在系统 menubar 注册"工具"子菜单，每个工具一个快捷键
// 触发时通过 webContents.send 把 toolKey 发给渲染层
const TOOL_MENU_ITEMS = [
  { label: "工具首页", tool: "home", accel: "CmdOrCtrl+1" },
  { label: "图片压缩", tool: "compress", accel: "CmdOrCtrl+2" },
  { label: "图集打包", tool: "atlas-pack", accel: "CmdOrCtrl+3" },
  { label: "图集拆分", tool: "atlas-unpack", accel: "CmdOrCtrl+4" },
  { label: "增量打包", tool: "atlas-incremental", accel: "CmdOrCtrl+5" },
  { label: "图标生成", tool: "icon-gen", accel: "CmdOrCtrl+6" },
  { label: "图片对比", tool: "image-diff", accel: "CmdOrCtrl+7" },
  { label: "批量重命名", tool: "batch-rename", accel: "CmdOrCtrl+8" },
  { label: "元数据剥离", tool: "metadata-strip", accel: "CmdOrCtrl+9" },
];

function buildMenu(window) {
  const isMac = process.platform === "darwin";
  const sendNavigate = (tool) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send("app:navigate", tool);
    }
  };
  const sendSetTheme = (theme) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send("app:set-theme", theme);
    }
  };

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    { role: "editMenu" },
    {
      label: "工具",
      submenu: TOOL_MENU_ITEMS.map((item) => ({
        label: item.label,
        accelerator: item.accel,
        click: () => sendNavigate(item.tool),
      })),
    },
    {
      label: "视图",
      submenu: [
        {
          label: "主题",
          submenu: [
            { label: "跟随系统", click: () => sendSetTheme("auto") },
            { label: "亮色", click: () => sendSetTheme("light") },
            { label: "暗色", click: () => sendSetTheme("dark") },
          ],
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

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
clipboard.register(ipcMain);
compress.register(ipcMain);
atlasPack.register(ipcMain);
atlasUnpack.register(ipcMain);
atlasIncremental.register(ipcMain);
iconGen.register(ipcMain);
imageDiff.register(ipcMain);
batchRename.register(ipcMain);
metadataStrip.register(ipcMain);

function createMainWindow() {
  createWindow();
  // 用最后一个新窗口做菜单事件目标
  const win = BrowserWindow.getAllWindows().slice(-1)[0];
  if (win) buildMenu(win);
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
