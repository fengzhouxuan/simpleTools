const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const core = require("../core/fs.cjs");

// ============================================================
// 1) 元数据格式探测：基于扩展名 + 首字符内容判断
// ============================================================

function detectFormat(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const head = (content || "").trim().slice(0, 200);

  if (ext === ".plist" || head.startsWith("<?xml") || head.startsWith("<plist")) {
    return "plist";
  }
  if (ext === ".css" || /^\s*\.[\w-]+\s*\{/m.test(head)) {
    return "css";
  }
  if (ext === ".json" || head.startsWith("{") || head.startsWith("[")) {
    // 进一步区分 json-hash 和 json-array：解析后看 frames 是 object 还是 array
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.frames)) return "json-array";
      return "json-hash";
    } catch {
      return "json-hash";
    }
  }
  return "json-hash";
}

// ============================================================
// 2) 解析器：四种格式统一返回 ParsedAtlasFrame 数组
// ============================================================

// frame.trimmed 表示该子图是否被 trim 过
// 当 sourceSize > spriteSourceSize 时，认为 trimmed=true
function makeFrame(name, frameRect, rotated, sourceRect, trimRect) {
  const trimmed =
    !!sourceRect &&
    !!trimRect &&
    (sourceRect.w !== trimRect.w ||
      sourceRect.h !== trimRect.h ||
      trimRect.x !== 0 ||
      trimRect.y !== 0);

  return {
    name,
    x: frameRect.x,
    y: frameRect.y,
    width: frameRect.w,
    height: frameRect.h,
    rotated: !!rotated,
    trimmed,
    sourceWidth: sourceRect?.w ?? frameRect.w,
    sourceHeight: sourceRect?.h ?? frameRect.h,
    trimX: trimRect?.x ?? 0,
    trimY: trimRect?.y ?? 0,
  };
}

function parseJsonHash(content) {
  const json = JSON.parse(content);
  const atlasW = json.meta?.size?.w ?? 0;
  const atlasH = json.meta?.size?.h ?? 0;
  const frames = [];
  for (const [name, entry] of Object.entries(json.frames || {})) {
    frames.push(
      makeFrame(
        name,
        entry.frame,
        entry.rotated,
        entry.sourceSize,
        entry.spriteSourceSize,
      ),
    );
  }
  return { atlasWidth: atlasW, atlasHeight: atlasH, frames };
}

function parseJsonArray(content) {
  const json = JSON.parse(content);
  const atlasW = json.meta?.size?.w ?? 0;
  const atlasH = json.meta?.size?.h ?? 0;
  const frames = (json.frames || []).map((entry) =>
    makeFrame(
      entry.filename,
      entry.frame,
      entry.rotated,
      entry.sourceSize,
      entry.spriteSourceSize,
    ),
  );
  return { atlasWidth: atlasW, atlasHeight: atlasH, frames };
}

// Cocos2d-x plist 用正则解析：DTD 结构稳定，正则比起引入 XML 解析器更轻
// 我们识别两种坐标格式：{{x,y},{w,h}} 与 {x,y} {w,h}
function parsePlistRect(str) {
  const m = String(str)
    .replace(/\s/g, "")
    .match(/^\{\{(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\},\{(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\}\}$/);
  if (!m) return null;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

function parsePlistSize(str) {
  const m = String(str)
    .replace(/\s/g, "")
    .match(/^\{(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\}$/);
  if (!m) return null;
  return { w: +m[1], h: +m[2] };
}

function parsePlist(content) {
  // 拿 metadata.size
  let atlasW = 0;
  let atlasH = 0;
  const metaSizeMatch = content.match(
    /<key>(?:size|atlasSize)<\/key>\s*<string>([^<]+)<\/string>/,
  );
  if (metaSizeMatch) {
    const sz = parsePlistSize(metaSizeMatch[1]);
    if (sz) {
      atlasW = sz.w;
      atlasH = sz.h;
    }
  }

  // 把 frames 块抠出来
  const framesBlock = content.match(
    /<key>frames<\/key>\s*<dict>([\s\S]+?)<\/dict>\s*<key>metadata<\/key>/,
  );
  const body = framesBlock ? framesBlock[1] : content;

  // 每个 frame：<key>name</key><dict>...</dict>
  const re = /<key>([^<]+)<\/key>\s*<dict>([\s\S]+?)<\/dict>/g;
  const frames = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[1];
    const inner = m[2];

    const get = (key) => {
      const r = new RegExp(
        `<key>${key}</key>\\s*<(string|integer|true|false)\\s*\\/?>(?:([^<]*)</\\1>)?`,
      );
      const mm = inner.match(r);
      if (!mm) return null;
      if (mm[1] === "true") return true;
      if (mm[1] === "false") return false;
      return mm[2] ?? null;
    };

    const frameRect =
      parsePlistRect(get("frame") || get("textureRect")) || { x: 0, y: 0, w: 0, h: 0 };
    const sourceColorRect = parsePlistRect(get("sourceColorRect") || "");
    const sourceSize = parsePlistSize(get("sourceSize") || "");
    const rotated = get("rotated") === true || get("textureRotated") === true;

    frames.push(makeFrame(name, frameRect, rotated, sourceSize, sourceColorRect));
  }

  return { atlasWidth: atlasW, atlasHeight: atlasH, frames };
}

// CSS Sprite：每个规则 .sprite-name { background-position: -x -y; width: Wpx; height: Hpx; }
function parseCss(content) {
  const ruleRe = /\.([\w-]+)\s*\{([^}]+)\}/g;
  const frames = [];
  let m;
  while ((m = ruleRe.exec(content)) !== null) {
    const cls = m[1];
    const body = m[2];
    if (!cls.startsWith("sprite-")) continue;
    const name = cls.replace(/^sprite-/, "") + ".png";

    const posMatch = body.match(/background-position\s*:\s*(-?\d+)px\s+(-?\d+)px/);
    const wMatch = body.match(/width\s*:\s*(\d+)px/);
    const hMatch = body.match(/height\s*:\s*(\d+)px/);
    if (!posMatch || !wMatch || !hMatch) continue;

    const x = -parseInt(posMatch[1], 10);
    const y = -parseInt(posMatch[2], 10);
    const w = parseInt(wMatch[1], 10);
    const h = parseInt(hMatch[1], 10);
    frames.push(makeFrame(name, { x, y, w, h }, false, null, null));
  }
  return { atlasWidth: 0, atlasHeight: 0, frames };
}

function parseMetadata(content, format) {
  switch (format) {
    case "plist":
      return parsePlist(content);
    case "json-array":
      return parseJsonArray(content);
    case "css":
      return parseCss(content);
    case "json-hash":
    default:
      return parseJsonHash(content);
  }
}

// ============================================================
// 3) inspectAtlas: 只解析元数据，给 UI 预览/校验用
// ============================================================

async function inspectAtlas(payload) {
  const { atlasPath, metadataPath } = payload;
  const metaContent = await fs.readFile(metadataPath, "utf8");
  const format = detectFormat(metadataPath, metaContent);
  const parsed = parseMetadata(metaContent, format);

  let atlasWidth = parsed.atlasWidth;
  let atlasHeight = parsed.atlasHeight;
  if ((!atlasWidth || !atlasHeight) && atlasPath) {
    try {
      const meta = await sharp(atlasPath).metadata();
      atlasWidth = meta.width || atlasWidth;
      atlasHeight = meta.height || atlasHeight;
    } catch {
      // 拿不到也不阻塞
    }
  }

  return {
    atlasWidth,
    atlasHeight,
    frames: parsed.frames,
    detectedFormat: format,
  };
}

// ============================================================
// 4) unpackAtlas: 实际切分写盘
// ============================================================

function safeBaseName(name) {
  // 元数据里的 name 可能含子路径（如 "hero/idle.png"），合理保留为子目录
  // 同时去除非法字符防止越权
  return name.replace(/\.\./g, "_").replace(/^\/+/, "");
}

async function unpackAtlas(payload, onProgress) {
  const inspect = await inspectAtlas(payload);
  const { frames } = inspect;

  await core.ensureOutputDir(payload.outputDir);

  // 预读 atlas 大图 buffer，每个 frame 用 sharp(buffer).extract() 切
  const atlasBuffer = await fs.readFile(payload.atlasPath);

  const outputPaths = [];
  const skipped = [];
  const startedAll = Date.now();
  const total = frames.length;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    onProgress?.({ current: i, total, stage: `拆出 ${frame.name}` });
    try {
      // 1) extract atlas 中对应矩形
      let pipeline = sharp(atlasBuffer).extract({
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
      });

      // 2) 处理 rotated：还原成未旋转的状态（顺时针 90° 打包 → 这里反向 90° 即 -90/270°）
      if (frame.rotated) {
        pipeline = pipeline.rotate(-90);
      }

      // 3) 处理 trim：扩回 sourceSize 填透明
      if (payload.restoreOriginalSize && frame.trimmed) {
        // rotated 还原后内容尺寸 = (frame.height, frame.width)，等价于未旋转时的子图实际占位
        // 我们的 spriteSourceSize 是按"未旋转视角"的，所以直接用 trimX/Y 即可
        const contentBuf = await pipeline.toBuffer();
        pipeline = sharp({
          create: {
            width: frame.sourceWidth,
            height: frame.sourceHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        }).composite([
          { input: contentBuf, left: frame.trimX, top: frame.trimY },
        ]);
      }

      // 4) 写文件
      const cleanName = safeBaseName(frame.name);
      const outPath = path.join(payload.outputDir, cleanName);
      await fs.mkdir(path.dirname(outPath), { recursive: true });

      // 输出格式跟原始扩展名走；统一用 PNG 保留透明
      await pipeline.png().toFile(outPath);
      outputPaths.push(outPath);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`[atlas-unpack] skip ${frame.name}:`, reason);
      skipped.push({ name: frame.name, reason });
    }
  }

  console.log(
    `[atlas-unpack] done: ${outputPaths.length}/${frames.length} in ${Date.now() - startedAll}ms`,
  );

  onProgress?.({ current: total, total, stage: "完成" });
  return { outputPaths, skipped };
}

// ============================================================
// 5) IPC
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:atlas-unpack:inspect", (_e, payload) => inspectAtlas(payload));
  ipcMain.handle("tools:atlas-unpack:export", (event, payload) =>
    unpackAtlas(payload, (p) =>
      event.sender.send("tools:atlas-unpack:progress", p),
    ),
  );
}

module.exports = {
  inspectAtlas,
  unpackAtlas,
  parseMetadata,
  detectFormat,
  register,
};
