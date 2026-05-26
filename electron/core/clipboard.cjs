const { clipboard } = require("electron");

function writeText(text) {
  if (typeof text !== "string") return { ok: false, error: "text must be string" };
  clipboard.writeText(text);
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("core:clipboard:write-text", (_e, text) => writeText(text));
}

module.exports = { writeText, register };
