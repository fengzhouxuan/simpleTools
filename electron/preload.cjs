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
    },
    webUtils: {
      getPathForFile: (file) => webUtils.getPathForFile(file),
    },
  },
  tools: {
    compress: {
      run: (payload) => ipcRenderer.invoke("tools:compress:run", payload),
    },
    atlasPack: {
      pack: (payload) => ipcRenderer.invoke("tools:atlas-pack:pack", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-pack:export", payload),
    },
    atlasUnpack: {
      inspect: (payload) => ipcRenderer.invoke("tools:atlas-unpack:inspect", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-unpack:export", payload),
    },
    atlasIncremental: {
      inspect: (payload) => ipcRenderer.invoke("tools:atlas-incremental:inspect", payload),
      export: (payload) => ipcRenderer.invoke("tools:atlas-incremental:export", payload),
    },
  },
});
