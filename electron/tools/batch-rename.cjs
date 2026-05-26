const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const core = require("../core/fs.cjs");

// ============================================================
// applyRules：纯函数，根据规则把 [{path, name}] 转成 plan [{from, to, conflict, unchanged}]
// ============================================================

function splitNameExt(name) {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, idx), ext: name.slice(idx) };
}

function padNumber(n, digits) {
  const s = String(Math.max(0, Math.floor(n)));
  if (digits <= s.length) return s;
  return "0".repeat(digits - s.length) + s;
}

// pure function：给定文件清单 + 规则，算出每个文件的新名字
function applyRules(files, rules) {
  const out = [];
  const safeRules = {
    prefix: rules?.prefix || "",
    suffix: rules?.suffix || "",
    sequence: {
      enabled: !!rules?.sequence?.enabled,
      start: Number.isFinite(rules?.sequence?.start) ? rules.sequence.start : 1,
      digits: Math.max(1, Math.min(6, rules?.sequence?.digits || 3)),
      insertAt: rules?.sequence?.insertAt === "suffix" ? "suffix" : "prefix",
    },
    regex: {
      enabled: !!rules?.regex?.enabled,
      pattern: rules?.regex?.pattern || "",
      flags: rules?.regex?.flags || "g",
      replacement: rules?.regex?.replacement || "",
    },
  };

  // 编译一次正则（无效 pattern → 不应用）
  let compiledRegex = null;
  if (safeRules.regex.enabled && safeRules.regex.pattern) {
    try {
      compiledRegex = new RegExp(safeRules.regex.pattern, safeRules.regex.flags);
    } catch {
      compiledRegex = null;
    }
  }

  const targetCount = new Map(); // to 路径 → 出现次数，用于检测同 plan 内冲突

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dir = path.dirname(file.path);
    const { stem, ext } = splitNameExt(file.name);

    let newStem = stem;

    // 1) 正则替换（作用在 stem 上）
    if (compiledRegex) {
      newStem = newStem.replace(compiledRegex, safeRules.regex.replacement);
    }

    // 2) 前缀 / 后缀
    if (safeRules.prefix) newStem = safeRules.prefix + newStem;
    if (safeRules.suffix) newStem = newStem + safeRules.suffix;

    // 3) 序号
    if (safeRules.sequence.enabled) {
      const num = padNumber(safeRules.sequence.start + i, safeRules.sequence.digits);
      if (safeRules.sequence.insertAt === "prefix") {
        newStem = num + newStem;
      } else {
        newStem = newStem + num;
      }
    }

    const newName = newStem + ext;
    const to = path.join(dir, newName);
    const unchanged = to === file.path;

    out.push({ from: file.path, to, conflict: false, unchanged });
    targetCount.set(to, (targetCount.get(to) || 0) + 1);
  }

  // 二次扫描标记冲突（plan 内重名）
  for (const item of out) {
    if (targetCount.get(item.to) > 1) {
      item.conflict = true;
    }
  }

  return out;
}

// ============================================================
// previewBatchRename: 给定 plan 计算结果（plus 检测 copy-to-dir 模式下目标已存在）
// 注：plan.to 在 in-place 模式下是原目录；copy-to-dir 模式下要重定向到 outputDir
// ============================================================

function rebaseToOutputDir(plan, outputDir) {
  if (!outputDir) return plan;
  return plan.map((item) => ({
    ...item,
    to: path.join(outputDir, path.basename(item.to)),
  }));
}

async function previewBatchRename(payload) {
  const { files, rules, mode, outputDir } = payload;
  let plan = applyRules(files, rules);
  if (mode === "copy-to-dir") {
    plan = rebaseToOutputDir(plan, outputDir);
  }
  // 异步标记"目标文件已存在但不是自己原文件"为冲突
  for (const item of plan) {
    if (item.conflict || item.unchanged) continue;
    try {
      const stat = await fs.stat(item.to);
      if (stat.isFile() && item.to !== item.from) {
        item.conflict = true;
      }
    } catch {
      // 不存在 → ok
    }
  }
  return plan;
}

// ============================================================
// executeBatchRename: 实际改名 / 复制
// ============================================================

async function executeBatchRename(payload, onProgress) {
  const { mode, outputDir } = payload;
  let plan = applyRules(payload.files, payload.rules);
  if (mode === "copy-to-dir") {
    if (!outputDir) throw new Error("copy-to-dir 模式需要选输出目录");
    await core.ensureOutputDir(outputDir);
    plan = rebaseToOutputDir(plan, outputDir);
  }

  const succeeded = [];
  const failed = [];
  const total = plan.length;

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    onProgress?.({
      current: i,
      total,
      stage: `${mode === "copy-to-dir" ? "复制改名" : "改名"} ${path.basename(item.from)}`,
    });

    if (item.unchanged) {
      // 跳过不变项
      continue;
    }
    if (item.conflict) {
      failed.push({ from: item.from, to: item.to, reason: "目标已存在或与其他项冲突" });
      continue;
    }
    try {
      if (mode === "copy-to-dir") {
        await fs.copyFile(item.from, item.to);
      } else {
        // in-place：要先检查 to 是否已存在（previewBatchRename 应该已经标了冲突，这里兜底）
        if (fsSync.existsSync(item.to) && item.to !== item.from) {
          throw new Error("目标已存在");
        }
        await fs.rename(item.from, item.to);
      }
      succeeded.push({ from: item.from, to: item.to });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failed.push({ from: item.from, to: item.to, reason });
    }
  }

  onProgress?.({ current: total, total, stage: "完成" });
  return { succeeded, failed };
}

// ============================================================
// IPC
// ============================================================

function register(ipcMain) {
  ipcMain.handle("tools:batch-rename:preview", (_e, payload) =>
    previewBatchRename(payload),
  );
  ipcMain.handle("tools:batch-rename:execute", (event, payload) =>
    executeBatchRename(payload, (p) =>
      event.sender.send("tools:batch-rename:progress", p),
    ),
  );
}

module.exports = {
  previewBatchRename,
  executeBatchRename,
  register,
  __test__: { applyRules, splitNameExt, padNumber, rebaseToOutputDir },
};
