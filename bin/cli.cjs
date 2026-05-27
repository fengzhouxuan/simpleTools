#!/usr/bin/env node
// SimpleImageCompress CLI 入口（纯 Node，不拉 Electron）
//
// 用法：
//   simpleimage <command> [args...] [options...]
//
// 见 --help 输出。

const path = require("node:path");
const fsSync = require("node:fs");
const { parseArgs } = require("node:util");

const compress = require("../electron/tools/compress.cjs");
const atlasPack = require("../electron/tools/atlas-pack.cjs");
const atlasUnpack = require("../electron/tools/atlas-unpack.cjs");
const atlasIncremental = require("../electron/tools/atlas-incremental.cjs");
const iconGen = require("../electron/tools/icon-gen.cjs");
const imageDiff = require("../electron/tools/image-diff.cjs");
const batchRename = require("../electron/tools/batch-rename.cjs");

// ============================================================
// 公共辅助
// ============================================================

function abs(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function makeProgressPrinter(prefix) {
  let lastCurrent = -1;
  return (p) => {
    // 简单进度行：每 5% 或最后一项才打印（避免刷屏）
    if (p.total <= 0) return;
    const step = Math.max(1, Math.floor(p.total / 20));
    if (p.current % step !== 0 && p.current !== p.total) return;
    if (p.current === lastCurrent) return;
    lastCurrent = p.current;
    process.stderr.write(
      `[${prefix}] ${p.current}/${p.total} ${p.stage}\n`,
    );
  };
}

function dieUsage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(USAGE);
  process.exit(msg ? 1 : 0);
}

// ============================================================
// USAGE
// ============================================================

const USAGE = `SimpleImageCompress CLI

USAGE
  simpleimage <command> [args...] [options...]

COMMANDS
  compress <files...>           压缩图片
    --preset <name>             网页配图 / 社交分享 / 归档高质量 / 最小体积（中文/拼音名都行）
    --output <dir>              输出目录（默认源目录）
    --quality <1-95>            质量 0-95（默认 92）
    --target-size <KB>          目标体积模式（KB）
    --format <fmt>              输出格式 original|jpg|png|webp（默认 original）

  atlas-pack <files...>         图集打包
    --output <dir>              输出目录（必填）
    --name <prefix>             文件名前缀（默认 atlas）
    --format <fmt>              元数据格式 json-hash|json-array|plist|css（默认 json-hash）
    --max-width <N>             单页最大宽（默认 2048）
    --max-height <N>            单页最大高（默认 2048）
    --padding <N>               子图间距（默认 2）
    --trim / --no-trim          去 alpha 边（默认 on）
    --rotate                    允许旋转
    --pot                       POT 尺寸

  atlas-unpack <atlas> <metadata>  图集拆分
    --output <dir>              输出目录（必填）
    --no-restore                不还原 trim 前原图尺寸

  icon-gen <source>             图标生成
    --output <dir>              输出目录（必填）
    --name <prefix>             文件名前缀（默认 icon）
    --targets <list>            逗号分隔：macos-icns,windows-ico,favicon,pwa
                                （默认 macos-icns,favicon）

  image-diff <a> <b>            图片对比
    --threshold <0-255>         差异阈值（默认 5）
    --output <path>             diff PNG 输出路径（可选）

  batch-rename <files...>       批量重命名
    --prefix <s>                文件名前缀
    --suffix <s>                文件名后缀（扩展名之前）
    --seq                       启用序号
    --seq-start <N>             序号起始（默认 1）
    --seq-digits <N>            序号位数（默认 3）
    --seq-pos prefix|suffix     序号位置（默认 prefix）
    --regex <pattern>           正则查找
    --regex-flags <flags>       正则标志（默认 g）
    --replacement <s>           替换内容
    --output <dir>              复制到新目录改名（默认原地）
    --dry-run                   只打印计划，不真改

GLOBAL
  -h, --help                    显示帮助
  -v, --verbose                 详细输出
`;

// ============================================================
// 命令分发
// ============================================================

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    dieUsage();
  }
  const cmd = argv[0];
  const rest = argv.slice(1);

  try {
    switch (cmd) {
      case "compress":
        await runCompress(rest);
        break;
      case "atlas-pack":
        await runAtlasPack(rest);
        break;
      case "atlas-unpack":
        await runAtlasUnpack(rest);
        break;
      case "icon-gen":
        await runIconGen(rest);
        break;
      case "image-diff":
        await runImageDiff(rest);
        break;
      case "batch-rename":
        await runBatchRename(rest);
        break;
      default:
        dieUsage(`Unknown command: ${cmd}`);
    }
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ============================================================
// compress
// ============================================================

const PRESET_PARAMS = {
  web: { mode: "quality", quality: 75, outputFormat: "webp", resizeWidth: "1920" },
  social: { mode: "quality", quality: 85, outputFormat: "jpg", resizeWidth: "1200" },
  archive: { mode: "quality", quality: 92, outputFormat: "original" },
  minimal: { mode: "target-size", quality: 60, targetSizeKB: 200, outputFormat: "original" },
};

async function runCompress(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      preset: { type: "string" },
      output: { type: "string" },
      quality: { type: "string" },
      "target-size": { type: "string" },
      format: { type: "string" },
    },
    allowPositionals: true,
  });
  if (positionals.length === 0) dieUsage("compress: 至少一个文件");

  const files = positionals.map((p) => {
    const ap = abs(p);
    const stat = fsSync.statSync(ap);
    return {
      id: ap,
      name: path.basename(ap),
      path: ap,
      ext: path.extname(ap).toLowerCase(),
      size: stat.size,
      supported: true,
    };
  });

  const preset = values.preset ? PRESET_PARAMS[values.preset] : null;
  const payload = {
    files,
    outputDir: values.output ? abs(values.output) : "",
    quality: values.quality ? parseInt(values.quality, 10) : preset?.quality ?? 92,
    mode: values["target-size"]
      ? "target-size"
      : preset?.mode ?? "quality",
    targetSizeKB: values["target-size"]
      ? parseInt(values["target-size"], 10)
      : preset?.targetSizeKB ?? 0,
    outputFormat: values.format ?? preset?.outputFormat ?? "original",
    saveMode: values.output ? "custom" : "source",
    resizeOptions: {
      width: preset?.resizeWidth ? parseInt(preset.resizeWidth, 10) : undefined,
      preserveAspect: true,
      resizeMode: "crop",
    },
  };

  const results = await compress.compressImages(payload, makeProgressPrinter("compress"));
  const done = results.filter((r) => r.status === "done");
  const failed = results.filter((r) => r.status === "failed");
  console.log(`Compressed ${done.length}/${results.length} files.`);
  if (failed.length > 0) {
    console.error(`${failed.length} failed:`);
    for (const f of failed) console.error(`  - ${f.name}: ${f.error}`);
    process.exit(2);
  }
}

// ============================================================
// atlas-pack
// ============================================================

async function runAtlasPack(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string" },
      name: { type: "string" },
      format: { type: "string" },
      "max-width": { type: "string" },
      "max-height": { type: "string" },
      padding: { type: "string" },
      trim: { type: "boolean" },
      "no-trim": { type: "boolean" },
      rotate: { type: "boolean" },
      pot: { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (positionals.length === 0) dieUsage("atlas-pack: 至少一个文件");
  if (!values.output) dieUsage("atlas-pack: 需要 --output");

  const inputs = positionals.map((p) => ({ path: abs(p), name: path.basename(p) }));
  const payload = {
    inputs,
    outputDir: abs(values.output),
    outputName: values.name ?? "atlas",
    format: values.format ?? "json-hash",
    maxWidth: values["max-width"] ? parseInt(values["max-width"], 10) : 2048,
    maxHeight: values["max-height"] ? parseInt(values["max-height"], 10) : 2048,
    padding: values.padding ? parseInt(values.padding, 10) : 2,
    allowRotate: !!values.rotate,
    pot: !!values.pot,
    trim: !values["no-trim"],
  };

  const result = await atlasPack.exportAtlas(payload, makeProgressPrinter("atlas-pack"));
  console.log(`Atlas exported: ${result.pageImagePaths.length} page(s), ${result.metadataPaths.length} metadata file(s).`);
  for (const p of result.pageImagePaths) console.log(`  ${p}`);
  for (const p of result.metadataPaths) console.log(`  ${p}`);
}

// ============================================================
// atlas-unpack
// ============================================================

async function runAtlasUnpack(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string" },
      "no-restore": { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (positionals.length < 2) dieUsage("atlas-unpack: 需要 atlas 和 metadata 两个文件");
  if (!values.output) dieUsage("atlas-unpack: 需要 --output");

  const result = await atlasUnpack.unpackAtlas(
    {
      atlasPath: abs(positionals[0]),
      metadataPath: abs(positionals[1]),
      outputDir: abs(values.output),
      restoreOriginalSize: !values["no-restore"],
    },
    makeProgressPrinter("atlas-unpack"),
  );
  console.log(`Unpacked ${result.outputPaths.length} sprites, ${result.skipped.length} skipped.`);
  if (result.skipped.length > 0) {
    for (const s of result.skipped) console.error(`  skip ${s.name}: ${s.reason}`);
  }
}

// ============================================================
// icon-gen
// ============================================================

async function runIconGen(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string" },
      name: { type: "string" },
      targets: { type: "string" },
    },
    allowPositionals: true,
  });
  if (positionals.length !== 1) dieUsage("icon-gen: 需要一张源图");
  if (!values.output) dieUsage("icon-gen: 需要 --output");

  const targets = values.targets
    ? values.targets.split(",").map((t) => t.trim()).filter(Boolean)
    : ["macos-icns", "favicon"];

  const result = await iconGen.generateIcons(
    {
      sourcePath: abs(positionals[0]),
      outputDir: abs(values.output),
      outputName: values.name ?? "icon",
      targets,
    },
    makeProgressPrinter("icon-gen"),
  );
  console.log(`Generated ${result.outputPaths.length} files; ${result.skipped.length} skipped.`);
  for (const p of result.outputPaths) console.log(`  ${p}`);
  if (result.skipped.length > 0) {
    for (const s of result.skipped) console.error(`  skip ${s.target}: ${s.reason}`);
    process.exit(2);
  }
}

// ============================================================
// image-diff
// ============================================================

async function runImageDiff(args) {
  const fs = require("node:fs/promises");
  const { values, positionals } = parseArgs({
    args,
    options: {
      threshold: { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: true,
  });
  if (positionals.length !== 2) dieUsage("image-diff: 需要两张图");

  const result = await imageDiff.diffImages({
    aPath: abs(positionals[0]),
    bPath: abs(positionals[1]),
    threshold: values.threshold ? parseInt(values.threshold, 10) : 5,
  });
  const s = result.stats;
  console.log(
    `Diff: ${s.diffPixels} / ${s.totalPixels} px (${(s.diffRatio * 100).toFixed(2)}%) · max ${s.maxDelta} · avg ${s.avgDelta.toFixed(2)} · ${s.sizesMatch ? "same size" : `A ${s.aSize.w}x${s.aSize.h} vs B ${s.bSize.w}x${s.bSize.h}`}`,
  );

  if (values.output) {
    // 把 base64 写盘
    const b64 = result.diffImageDataUri.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(abs(values.output), Buffer.from(b64, "base64"));
    console.log(`Diff PNG written: ${abs(values.output)}`);
  }

  // 退出码：完全相同 0，有差异 2，方便 CI / shell 脚本判断
  if (s.diffPixels > 0) process.exit(2);
}

// ============================================================
// batch-rename
// ============================================================

async function runBatchRename(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      prefix: { type: "string" },
      suffix: { type: "string" },
      seq: { type: "boolean" },
      "seq-start": { type: "string" },
      "seq-digits": { type: "string" },
      "seq-pos": { type: "string" },
      regex: { type: "string" },
      "regex-flags": { type: "string" },
      replacement: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (positionals.length === 0) dieUsage("batch-rename: 至少一个文件");

  const files = positionals.map((p) => ({ path: abs(p), name: path.basename(p) }));
  const rules = {
    prefix: values.prefix ?? "",
    suffix: values.suffix ?? "",
    sequence: {
      enabled: !!values.seq,
      start: values["seq-start"] ? parseInt(values["seq-start"], 10) : 1,
      digits: values["seq-digits"] ? parseInt(values["seq-digits"], 10) : 3,
      insertAt: values["seq-pos"] === "suffix" ? "suffix" : "prefix",
    },
    regex: {
      enabled: !!values.regex,
      pattern: values.regex ?? "",
      flags: values["regex-flags"] ?? "g",
      replacement: values.replacement ?? "",
    },
  };
  const mode = values.output ? "copy-to-dir" : "in-place";
  const payload = { files, rules, mode, outputDir: values.output ? abs(values.output) : "" };

  if (values["dry-run"]) {
    const plan = await batchRename.previewBatchRename(payload);
    for (const item of plan) {
      const status = item.conflict
        ? "[CONFLICT]"
        : item.unchanged
          ? "[unchanged]"
          : "[ok]";
      console.log(`${status} ${item.from} → ${item.to}`);
    }
    const conflicts = plan.filter((p) => p.conflict).length;
    if (conflicts > 0) {
      console.error(`\n${conflicts} conflict(s); aborting.`);
      process.exit(2);
    }
    return;
  }

  const result = await batchRename.executeBatchRename(
    payload,
    makeProgressPrinter("batch-rename"),
  );
  console.log(`Renamed ${result.succeeded.length}; ${result.failed.length} failed.`);
  if (result.failed.length > 0) {
    for (const f of result.failed) console.error(`  fail ${f.from}: ${f.reason}`);
    process.exit(2);
  }
}

main();
