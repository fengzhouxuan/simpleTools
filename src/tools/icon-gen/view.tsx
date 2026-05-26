import { useEffect, useRef, useState } from "preact/hooks";
import { ProgressBar } from "../../components/progress-bar";
import { CopyPathButton } from "../../components/copy-path-button";
import { Spinner } from "../../components/spinner";
import { useToast } from "../../shared/toast";
import { usePrimaryAction } from "../../shared/use-primary-action";
import type { IconExportTarget } from "../../shared/types";
import { useIconGen } from "./state";

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

type TargetMeta = {
  key: IconExportTarget;
  label: string;
  description: string;
  hint: string;
};

const TARGETS: TargetMeta[] = [
  {
    key: "macos-icns",
    label: "macOS · icns",
    description: "桌面应用图标 (16 ~ 1024)",
    hint: "用 iconutil 命令打包，要求本机有此工具（macOS 自带）",
  },
  {
    key: "windows-ico",
    label: "Windows · ico",
    description: "桌面应用图标 (16 ~ 256)",
    hint: "多分辨率打包成单文件",
  },
  {
    key: "favicon",
    label: "Web favicon",
    description: "16/32/64/180/192/256/512 多份 PNG",
    hint: "含 apple-touch-icon (180)",
  },
  {
    key: "pwa",
    label: "PWA / 应用商店",
    description: "192 / 512 / 1024 PNG",
    hint: "manifest.json 常用尺寸",
  },
];

function extractFirstDroppedPath(event: DragEvent): string | null {
  const uriList = event.dataTransfer?.getData("text/uri-list") ?? "";
  const fromUri = uriList
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.startsWith("file://"));
  if (fromUri) {
    try {
      return decodeURIComponent(fromUri.replace("file://", ""));
    } catch {
      // fall through
    }
  }
  const files = Array.from(event.dataTransfer?.files ?? []);
  for (const f of files) {
    const direct = (f as File & { path?: string }).path;
    if (direct) return direct;
    try {
      const p = window.simpleImage.core.webUtils.getPathForFile(f);
      if (p) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export function IconGenView() {
  const { state, patch, toggleTarget, clearSession, runGenerate } = useIconGen();
  const [dragOver, setDragOver] = useState(false);

  const handlePickSource = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Source Image", extensions: ["png", "jpg", "jpeg", "webp"] },
    ]);
    if (picked) patch({ sourcePath: picked });
  };

  const handleSourceDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const p = extractFirstDroppedPath(e);
    if (p && /\.(png|jpe?g|webp)$/i.test(p)) {
      patch({ sourcePath: p });
    }
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const canRun =
    !!state.sourcePath &&
    !!state.outputDir &&
    state.targets.length > 0 &&
    !state.running;

  usePrimaryAction(canRun, () => void runGenerate());

  const toast = useToast();
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !state.running) {
      if (state.lastResult) {
        const total = state.lastResult.outputPaths.length;
        const skipped = state.lastResult.skipped.length;
        if (total > 0 && skipped === 0) {
          toast.push({ type: "success", message: `图标生成完成：${total} 个文件` });
        } else if (total > 0 && skipped > 0) {
          toast.push({
            type: "warning",
            message: `生成完成：${total} 成功，${skipped} 失败（${state.lastResult.skipped.map((s) => s.target).join(", ")}）`,
          });
        } else {
          toast.push({ type: "error", message: "没有图标生成成功" });
        }
      } else if (state.lastError) {
        toast.push({ type: "error", message: state.lastError });
      }
    }
    wasRunningRef.current = state.running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running]);

  const summary = state.lastResult
    ? `${state.lastResult.outputPaths.length} 个文件已生成${
        state.lastResult.skipped.length > 0
          ? ` · ${state.lastResult.skipped.length} 个目标失败`
          : ""
      }`
    : state.running
      ? "生成中..."
      : "选择源图、目标格式与输出目录";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图标生成</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 源图选择 */}
        <section class="settings-grid">
          <div
            class={`settings-card icon-source-drop ${dragOver ? "is-drag-over" : ""}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={handleSourceDrop}
          >
            <div class="option-block">
              <span class="option-label">源图（推荐 ≥ 1024×1024）</span>
              <button
                class={`path-button ${state.sourcePath ? "" : "is-empty"}`}
                onClick={() => void handlePickSource()}
              >
                {basename(state.sourcePath) || "选择源图 (PNG/JPG/WebP)..."}
              </button>
              <span class="param-hint">
                也可以直接拖入文件 · 透明背景 PNG 效果最佳，JPG 会自动填充透明区
              </span>
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">输出目录</span>
              <button
                class={`path-button ${state.outputDir ? "" : "is-empty"}`}
                onClick={() => void handlePickOutput()}
              >
                {state.outputDir || "选择目录..."}
              </button>
            </div>
            <div class="option-block">
              <span class="option-label">文件名前缀</span>
              <input
                type="text"
                value={state.outputName}
                onInput={(e) =>
                  patch({
                    outputName:
                      (e.currentTarget as HTMLInputElement).value.trim() || "icon",
                  })
                }
              />
            </div>
          </div>
        </section>

        {/* 目标格式选择 */}
        <section class="settings-grid icon-target-grid">
          {TARGETS.map((t) => {
            const active = state.targets.includes(t.key);
            return (
              <button
                key={t.key}
                class={`icon-target-card ${active ? "is-active" : ""}`}
                onClick={() => toggleTarget(t.key)}
              >
                <div class="icon-target-head">
                  <input
                    type="checkbox"
                    checked={active}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleTarget(t.key)}
                  />
                  <strong>{t.label}</strong>
                </div>
                <span class="icon-target-desc">{t.description}</span>
                <span class="icon-target-hint">{t.hint}</span>
              </button>
            );
          })}
        </section>

        {/* 操作栏 */}
        <section class="action-bar">
          <div class="action-entry">
            <button
              class="action-button action-primary"
              onClick={() => void handlePickSource()}
            >
              选择源图
            </button>
          </div>
          <div class="action-meta">
            <span>
              {state.targets.length === 0
                ? "至少选 1 个目标格式"
                : `已选 ${state.targets.length} 个目标`}
            </span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!state.sourcePath && state.targets.length === 0}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canRun}
              onClick={() => void runGenerate()}
            >
              {state.running ? (<><Spinner />生成中...</>) : "一键生成"}
            </button>
          </div>
        </section>

        {state.running && (
          <ProgressBar progress={state.progress} taskLabel="生成" />
        )}

        {state.lastError && (
          <section class="compat-warning">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.lastError}</span>
          </section>
        )}

        {state.lastResult && state.lastResult.outputPaths.length > 0 && (
          <section class="summary-banner">
            <strong>生成完成</strong>
            <span>
              {state.lastResult.outputPaths.length} 个文件
              {state.lastResult.skipped.length > 0
                ? ` · ${state.lastResult.skipped.length} 个失败：${state.lastResult.skipped.map((s) => s.target).join(", ")}`
                : ""}
            </span>
            <span class="summary-spacer" />
            <CopyPathButton text={state.lastResult.outputPaths[0] ?? ""} />
            <button
              class="ghost-button"
              onClick={() => {
                const first = state.lastResult?.outputPaths[0];
                if (first) void window.simpleImage.core.fs.revealInFolder(first);
              }}
            >
              在 Finder 中显示
            </button>
          </section>
        )}
      </div>
    </section>
  );
}
