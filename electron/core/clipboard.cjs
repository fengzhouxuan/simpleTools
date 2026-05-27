// electron 懒加载：CLI 模式下 require 这个文件不会立即拉 electron
function writeText(text) {
  if (typeof text !== "string") return { ok: false, error: "text must be string" };
  // eslint-disable-next-line global-require
  const { clipboard } = require("electron");
  clipboard.writeText(text);
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("core:clipboard:write-text", (_e, text) => writeText(text));
}

module.exports = { writeText, register };
