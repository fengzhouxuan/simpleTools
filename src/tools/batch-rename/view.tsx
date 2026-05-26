import { useEffect, useRef } from "preact/hooks";
import { FileImportZone } from "../../components/file-import";
import { ProgressBar } from "../../components/progress-bar";
import { Spinner } from "../../components/spinner";
import { useToast } from "../../shared/toast";
import { usePrimaryAction } from "../../shared/use-primary-action";
import { useBatchRename } from "./state";

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function BatchRenameView() {
  const {
    state,
    patch,
    patchRules,
    importFiles,
    clearSession,
    execute,
  } = useBatchRename();

  const isEmpty = state.files.length === 0;
  const conflictCount = state.plan?.filter((p) => p.conflict).length ?? 0;
  const unchangedCount = state.plan?.filter((p) => p.unchanged).length ?? 0;
  const changeCount = state.plan
    ? state.plan.length - unchangedCount - conflictCount
    : 0;

  const canExecute =
    state.files.length > 0 &&
    !!state.plan &&
    changeCount > 0 &&
    conflictCount === 0 &&
    !state.running &&
    (state.mode !== "copy-to-dir" || !!state.outputDir);

  usePrimaryAction(canExecute, () => void execute());

  // 跑完弹 toast
  const toast = useToast();
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !state.running && state.lastResult) {
      const s = state.lastResult.succeeded.length;
      const f = state.lastResult.failed.length;
      if (f === 0) {
        toast.push({ type: "success", message: `重命名完成：${s} 个文件` });
      } else if (s > 0) {
        toast.push({ type: "warning", message: `${s} 成功，${f} 失败` });
      } else {
        toast.push({ type: "error", message: `${f} 个文件全部失败` });
      }
    }
    wasRunningRef.current = state.running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running]);

  const handlePickFiles = async () => {
    const picked = await window.simpleImage.core.fs.pickFiles();
    importFiles(picked);
  };

  const handlePickFolder = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (!dir) return;
    importFiles(await window.simpleImage.core.fs.scanDirectory(dir));
  };

  const handlePathsDropped = async (paths: string[]) => {
    const files = await window.simpleImage.core.fs.normalizePaths(paths);
    importFiles(files);
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const summary = state.plan
    ? `${changeCount} 项会改名${
        unchangedCount > 0 ? ` · ${unchangedCount} 项不变` : ""
      }${conflictCount > 0 ? ` · ${conflictCount} 项冲突` : ""}`
    : state.computing
      ? "计算中..."
      : "导入文件后开始";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>批量重命名</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 文件导入区 */}
        <section
          class="stage-panel"
          style={{ minHeight: isEmpty ? "180px" : "220px" }}
        >
          <FileImportZone
            empty={isEmpty}
            emptyTitle="拖入要批量改名的文件"
            emptyDefaultHint="支持任何类型的文件，不限图像"
            onPathsDropped={(paths) => void handlePathsDropped(paths)}
          >
            <div class="atlas-input-list">
              {state.files.map((f, idx) => {
                const planItem = state.plan?.[idx];
                return (
                  <div key={f.path} class="rename-row" title={f.path}>
                    <span class="rename-from">{f.name}</span>
                    <span class="rename-arrow">→</span>
                    <span
                      class={`rename-to ${
                        planItem?.conflict
                          ? "is-conflict"
                          : planItem?.unchanged
                            ? "is-unchanged"
                            : "is-changed"
                      }`}
                    >
                      {planItem ? basename(planItem.to) : "..."}
                    </span>
                  </div>
                );
              })}
            </div>
          </FileImportZone>
        </section>

        {/* 操作栏 */}
        <section class="action-bar">
          <div class="action-entry">
            <button
              class="action-button action-primary"
              onClick={() => void handlePickFiles()}
            >
              添加文件
            </button>
            <button
              class="action-button action-secondary"
              onClick={() => void handlePickFolder()}
            >
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{state.files.length} 个文件</span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={isEmpty}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canExecute}
              onClick={() => void execute()}
            >
              {state.running ? (
                <>
                  <Spinner />
                  改名中...
                </>
              ) : (
                "应用重命名"
              )}
            </button>
          </div>
        </section>

        {state.running && (
          <ProgressBar progress={state.progress} taskLabel="改名" />
        )}

        {/* 规则面板 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>前缀</span>
                <input
                  type="text"
                  placeholder="hero_"
                  value={state.rules.prefix}
                  onInput={(e) =>
                    patchRules({
                      prefix: (e.currentTarget as HTMLInputElement).value,
                    })
                  }
                />
              </label>
              <label class="mini-field">
                <span>后缀（扩展名之前）</span>
                <input
                  type="text"
                  placeholder="_v2"
                  value={state.rules.suffix}
                  onInput={(e) =>
                    patchRules({
                      suffix: (e.currentTarget as HTMLInputElement).value,
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div class="settings-card">
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={state.rules.sequence.enabled}
                onChange={(e) =>
                  patchRules({
                    sequence: {
                      ...state.rules.sequence,
                      enabled: (e.currentTarget as HTMLInputElement).checked,
                    },
                  })
                }
              />
              <span>添加序号</span>
            </label>
            <div class="settings-row" style={{ marginTop: "8px" }}>
              <label class="mini-field">
                <span>起始</span>
                <input
                  type="number"
                  min="0"
                  value={state.rules.sequence.start}
                  disabled={!state.rules.sequence.enabled}
                  onInput={(e) =>
                    patchRules({
                      sequence: {
                        ...state.rules.sequence,
                        start: Math.max(
                          0,
                          Number((e.currentTarget as HTMLInputElement).value) || 0,
                        ),
                      },
                    })
                  }
                />
              </label>
              <label class="mini-field">
                <span>位数（001 / 0001）</span>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={state.rules.sequence.digits}
                  disabled={!state.rules.sequence.enabled}
                  onInput={(e) =>
                    patchRules({
                      sequence: {
                        ...state.rules.sequence,
                        digits: Math.max(
                          1,
                          Math.min(
                            6,
                            Number((e.currentTarget as HTMLInputElement).value) || 1,
                          ),
                        ),
                      },
                    })
                  }
                />
              </label>
            </div>
            <div class="mode-line" style={{ marginTop: "8px" }}>
              <label class="radio-row">
                <input
                  type="radio"
                  name="seq-insert"
                  checked={state.rules.sequence.insertAt === "prefix"}
                  disabled={!state.rules.sequence.enabled}
                  onChange={() =>
                    patchRules({
                      sequence: { ...state.rules.sequence, insertAt: "prefix" },
                    })
                  }
                />
                <span>序号在前</span>
              </label>
              <label class="radio-row">
                <input
                  type="radio"
                  name="seq-insert"
                  checked={state.rules.sequence.insertAt === "suffix"}
                  disabled={!state.rules.sequence.enabled}
                  onChange={() =>
                    patchRules({
                      sequence: { ...state.rules.sequence, insertAt: "suffix" },
                    })
                  }
                />
                <span>序号在后</span>
              </label>
            </div>
          </div>
        </section>

        {/* 正则替换 */}
        <section class="advanced-panel">
          <label class="checkbox-row">
            <input
              type="checkbox"
              checked={state.rules.regex.enabled}
              onChange={(e) =>
                patchRules({
                  regex: {
                    ...state.rules.regex,
                    enabled: (e.currentTarget as HTMLInputElement).checked,
                  },
                })
              }
            />
            <span>正则查找替换（作用于文件名，不含扩展名）</span>
          </label>
          <div class="settings-row" style={{ marginTop: "8px" }}>
            <label class="mini-field">
              <span>查找（正则）</span>
              <input
                type="text"
                placeholder="^Copy of "
                value={state.rules.regex.pattern}
                disabled={!state.rules.regex.enabled}
                onInput={(e) =>
                  patchRules({
                    regex: {
                      ...state.rules.regex,
                      pattern: (e.currentTarget as HTMLInputElement).value,
                    },
                  })
                }
              />
            </label>
            <label class="mini-field">
              <span>替换为</span>
              <input
                type="text"
                placeholder="（留空则删除）"
                value={state.rules.regex.replacement}
                disabled={!state.rules.regex.enabled}
                onInput={(e) =>
                  patchRules({
                    regex: {
                      ...state.rules.regex,
                      replacement: (e.currentTarget as HTMLInputElement).value,
                    },
                  })
                }
              />
            </label>
          </div>
          <span class="param-hint">
            标志：<code>g</code> 全局 / <code>i</code> 忽略大小写。支持捕获组 <code>$1 $2</code>。当前 flags：
            <input
              type="text"
              style={{
                width: "60px",
                marginLeft: "8px",
                height: "22px",
                padding: "0 6px",
                fontSize: "11px",
              }}
              value={state.rules.regex.flags}
              disabled={!state.rules.regex.enabled}
              onInput={(e) =>
                patchRules({
                  regex: {
                    ...state.rules.regex,
                    flags: (e.currentTarget as HTMLInputElement).value,
                  },
                })
              }
            />
          </span>
        </section>

        {/* 执行模式 */}
        <section class="settings-grid">
          <div class="settings-card">
            <span class="option-label">执行模式</span>
            <div class="mode-line">
              <label class="radio-row">
                <input
                  type="radio"
                  name="rename-mode"
                  checked={state.mode === "in-place"}
                  onChange={() => patch({ mode: "in-place" })}
                />
                <span>原地改名（替换原文件）</span>
              </label>
              <label class="radio-row">
                <input
                  type="radio"
                  name="rename-mode"
                  checked={state.mode === "copy-to-dir"}
                  onChange={() => patch({ mode: "copy-to-dir" })}
                />
                <span>复制到新目录改名</span>
              </label>
            </div>
            <span class="param-hint">
              原地改名直接修改原始文件路径，复制模式保留原文件
            </span>
          </div>
          {state.mode === "copy-to-dir" && (
            <div class="settings-card">
              <span class="option-label">输出目录</span>
              <button
                class={`path-button ${state.outputDir ? "" : "is-empty"}`}
                onClick={() => void handlePickOutput()}
              >
                {state.outputDir || "选择目录..."}
              </button>
            </div>
          )}
        </section>

        {conflictCount > 0 && (
          <section class="compat-warning" role="alert">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">
              检测到 {conflictCount} 项冲突（目标名重名或目标路径已存在）— 必须解决冲突后才能执行
            </span>
          </section>
        )}

        {state.lastError && (
          <section class="compat-warning" role="alert">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.lastError}</span>
          </section>
        )}

        {state.lastResult && (
          <section class="summary-banner" role="status">
            <strong>重命名完成</strong>
            <span>
              {state.lastResult.succeeded.length} 成功
              {state.lastResult.failed.length > 0
                ? ` · ${state.lastResult.failed.length} 失败`
                : ""}
            </span>
          </section>
        )}
      </div>
    </section>
  );
}
