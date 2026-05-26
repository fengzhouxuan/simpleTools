const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("simpleImage", {
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
  },
});
