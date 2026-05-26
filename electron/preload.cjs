const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("simpleImage", {
  // 主进程菜单 → 渲染层切工具
  onNavigate: (callback) => {
    const wrapped = (_e, tool) => callback(tool);
    ipcRenderer.on("app:navigate", wrapped);
    return () => ipcRenderer.off("app:navigate", wrapped);
  },
  // 主进程菜单 → 渲染层切主题
  onSetTheme: (callback) => {
    const wrapped = (_e, theme) => callback(theme);
    ipcRenderer.on("app:set-theme", wrapped);
    return () => ipcRenderer.off("app:set-theme", wrapped);
  },
  core: {
    fs: {
      pickFiles: () => ipcRenderer.invoke("core:fs:pick-files"),
      pickFolder: () => ipcRenderer.invoke("core:fs:pick-folder"),
      pickSingleFile: (filters) => ipcRenderer.invoke("core:fs:pick-single-file", filters),
      firstExisting: (paths) => ipcRenderer.invoke("core:fs:first-existing", paths),
      scanDirectory: (dirPath) => ipcRenderer.invoke("core:fs:scan-directory", dirPath),
      normalizePaths: (paths) => ipcRenderer.invoke("core:fs:normalize-paths", paths),
      openPath: (filePath) => ipcRenderer.invoke("core:fs:open-path", filePath),
      revealInFolder: (filePath) => ipcRenderer.invoke("core:fs:reveal-in-folder", filePath),
      openExternal: (url) => ipcRenderer.invoke("core:fs:open-external", url),
    },
    webUtils: {
      getPathForFile: (file) => webUtils.getPathForFile(file),
    },
    settings: {
      get: (key, defaultValue) => ipcRenderer.invoke("core:settings:get", key, defaultValue),
      set: (key, value) => ipcRenderer.invoke("core:settings:set", key, value),
    },
    clipboard: {
      writeText: (text) => ipcRenderer.invoke("core:clipboard:write-text", text),
    },
  },
  tools: {
    compress: {
      run: (payload) => ipcRenderer.invoke("tools:compress:run", payload),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:compress:progress", wrapped);
        return () => ipcRenderer.off("tools:compress:progress", wrapped);
      },
    },
    atlasPack: {
      pack: (payload) => ipcRenderer.invoke("tools:atlas-pack:pack", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-pack:export", payload),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:atlas-pack:progress", wrapped);
        return () => ipcRenderer.off("tools:atlas-pack:progress", wrapped);
      },
    },
    atlasUnpack: {
      inspect: (payload) => ipcRenderer.invoke("tools:atlas-unpack:inspect", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-unpack:export", payload),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:atlas-unpack:progress", wrapped);
        return () => ipcRenderer.off("tools:atlas-unpack:progress", wrapped);
      },
    },
    atlasIncremental: {
      preview: (payload) => ipcRenderer.invoke("tools:atlas-incremental:preview", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-incremental:export", payload),
      clearCache: () => ipcRenderer.invoke("tools:atlas-incremental:clear-cache"),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:atlas-incremental:progress", wrapped);
        return () => ipcRenderer.off("tools:atlas-incremental:progress", wrapped);
      },
    },
    iconGen: {
      run: (payload) => ipcRenderer.invoke("tools:icon-gen:run", payload),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:icon-gen:progress", wrapped);
        return () => ipcRenderer.off("tools:icon-gen:progress", wrapped);
      },
    },
    imageDiff: {
      run: (payload) => ipcRenderer.invoke("tools:image-diff:run", payload),
    },
    batchRename: {
      preview: (payload) => ipcRenderer.invoke("tools:batch-rename:preview", payload),
      execute: (payload) => ipcRenderer.invoke("tools:batch-rename:execute", payload),
      onProgress: (callback) => {
        const wrapped = (_e, payload) => callback(payload);
        ipcRenderer.on("tools:batch-rename:progress", wrapped);
        return () => ipcRenderer.off("tools:batch-rename:progress", wrapped);
      },
    },
  },
});
