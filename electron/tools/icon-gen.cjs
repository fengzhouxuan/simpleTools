const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const sharp = require("sharp");
const core = require("../core/fs.cjs");

const execFileAsync = promisify(execFile);

// ============================================================
// 目标尺寸定义
// ============================================================

// macOS .icns 需要的 iconset 文件名+像素尺寸（Apple 官方规范）
const ICNS_ICONSET_FILES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

const FAVICON_SIZES = [
  { size: 16, name: "favicon-16.png" },
  { size: 32, name: "favicon-32.png" },
  { size: 64, name: "favicon-64.png" },
  { size: 180, name: "apple-touch-icon.png" }, // iOS 主屏图标标准尺寸
  { size: 192, name: "favicon-192.png" },
  { size: 256, name: "favicon-256.png" },
  { size: 512, name: "favicon-512.png" },
];

const PWA_SIZES = [
  { size: 192, name: "pwa-192.png" },
  { size: 512, name: "pwa-512.png" },
  { size: 1024, name: "pwa-1024.png" },
];

// ============================================================
// 工具函数：把源图缩放到指定 size 并写出 PNG
// ============================================================

async function resizeToFile(sourcePath, outputPath, size) {
  await sharp(sourcePath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
}

async function resizeToBuffer(sourcePath, size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ============================================================
// 单个 target 的导出实现
// ============================================================

async function exportMacosIcns(sourcePath, outputDir, outputName, onProgress) {
  // 1) 生成 iconset 临时目录
  const iconsetDir = path.join(outputDir, `${outputName}.iconset`);
  await fs.mkdir(iconsetDir, { recursive: true });

  const total = ICNS_ICONSET_FILES.length;
  for (let i = 0; i < total; i++) {
    const { name, size } = ICNS_ICONSET_FILES[i];
    onProgress?.({
      current: i,
      total,
      stage: `macOS：${name} (${size}×${size})`,
    });
    await resizeToFile(sourcePath, path.join(iconsetDir, name), size);
  }

  // 2) iconutil -c icns 生成 .icns
  const icnsPath = path.join(outputDir, `${outputName}.icns`);
  onProgress?.({ current: total, total, stage: "macOS：iconutil 打包" });
  try {
    await execFileAsync("iconutil", ["-c", "icns", "-o", icnsPath, iconsetDir]);
  } catch (e) {
    throw new Error(`iconutil 失败：${e.message}（确认本机有 iconutil，macOS 自带）`);
  }

  // 3) 清理 iconset 临时目录
  await fs.rm(iconsetDir, { recursive: true, force: true });

  return [icnsPath];
}

async function exportWindowsIco(sourcePath, outputDir, outputName, onProgress) {
  const total = ICO_SIZES.length;
  const buffers = [];
  for (let i = 0; i < total; i++) {
    const size = ICO_SIZES[i];
    onProgress?.({
      current: i,
      total,
      stage: `Windows：${size}×${size}`,
    });
    buffers.push(await resizeToBuffer(sourcePath, size));
  }
  // to-ico 是动态 require：库较旧（CJS），按需加载避免主进程启动慢
  const toIco = require("to-ico");
  const icoBuf = await toIco(buffers);
  const icoPath = path.join(outputDir, `${outputName}.ico`);
  await fs.writeFile(icoPath, icoBuf);
  return [icoPath];
}

async function exportPngSet(sourcePath, outputDir, sizes, prefix, onProgress) {
  const out = [];
  const total = sizes.length;
  for (let i = 0; i < total; i++) {
    const { size, name } = sizes[i];
    onProgress?.({
      current: i,
      total,
      stage: `${prefix}：${name} (${size}×${size})`,
    });
    const outPath = path.join(outputDir, name);
    await resizeToFile(sourcePath, outPath, size);
    out.push(outPath);
  }
  return out;
}

// ============================================================
// 主入口
// ============================================================

async function generateIcons(payload, onProgress) {
  const { sourcePath, outputDir, outputName = "icon", targets } = payload;
  if (!sourcePath) throw new Error("没有选择源图");
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("至少选择一个导出目标");
  }
  await core.ensureOutputDir(outputDir);

  // 校验源图至少 1024x1024（图标常用）
  const meta = await sharp(sourcePath).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 256 || h < 256) {
    console.warn(
      `[icon-gen] source is ${w}x${h}, recommended ≥ 1024×1024 for full quality`,
    );
  }

  const outputPaths = [];
  const skipped = [];

  // 总体进度：按 target 数量分阶段
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const targetPrefix = `${target} [${i + 1}/${targets.length}]`;
    const wrapProgress = (p) =>
      onProgress?.({ ...p, stage: `${targetPrefix} · ${p.stage}` });

    try {
      let paths = [];
      if (target === "macos-icns") {
        paths = await exportMacosIcns(sourcePath, outputDir, outputName, wrapProgress);
      } else if (target === "windows-ico") {
        paths = await exportWindowsIco(sourcePath, outputDir, outputName, wrapProgress);
      } else if (target === "favicon") {
        paths = await exportPngSet(sourcePath, outputDir, FAVICON_SIZES, "Web", wrapProgress);
      } else if (target === "pwa") {
        paths = await exportPngSet(sourcePath, outputDir, PWA_SIZES, "PWA", wrapProgress);
      } else {
        skipped.push({ target, reason: `不支持的 target：${target}` });
        continue;
      }
      outputPaths.push(...paths);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`[icon-gen] target ${target} failed:`, reason);
      skipped.push({ target, reason });
    }
  }

  return { outputPaths, skipped };
}

// ============================================================
// IPC
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:icon-gen:run", (event, payload) =>
    generateIcons(payload, (p) =>
      event.sender.send("tools:icon-gen:progress", p),
    ),
  );
}

module.exports = { generateIcons, register };
