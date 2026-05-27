import { useEffect, useRef } from "preact/hooks";
import { ProgressBar } from "../../components/progress-bar";
import { Spinner } from "../../components/spinner";
import { useToast } from "../../shared/toast";
import { usePrimaryAction } from "../../shared/use-primary-action";
import { formatPath, formatRatio } from "../../shared/format";
import { useNineSliceCrop } from "./state";
import type { PreviewMode } from "./state";
import { NineSliceEditor } from "./editor";
import type { NineSliceInsets } from "../../shared/types";

type TemplateKind = "9slice" | "3h" | "3v";

// 根据当前 insets 反推用了哪个模板（用户拖辅助线后 != 任一模板就显示 "custom"）
function deriveTemplate(i: NineSliceInsets): TemplateKind | null {
  const { l, t, r, b } = i;
  if (l + t + r + b === 0) return null;
  if (l > 0 && t > 0 && r > 0 && b > 0 && l === r && t === b) return "9slice";
  if (l > 0 && r > 0 && l === r && t === 0 && b === 0) return "3h";
  if (t > 0 && b > 0 && t === b && l === 0 && r === 0) return "3v";
  return null;
}

// 跟 atlas-preview / editor 同款 file:// 路径编码
function pathToFileUrl(p: string): string {
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
}

// 用 sharp.metadata 兼容的浏览器端做法：用 <img> 读尺寸
async function readImageMeta(filePath: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("无法读取图片尺寸"));
    img.src = pathToFileUrl(filePath);
  });
}

const PREVIEW_MODE_OPTIONS: { value: PreviewMode; label: string }[] = [
  { value: "original", label: "原图" },
  { value: "restored", label: "还原图" },
  { value: "diff", label: "Diff" },
];

export function NineSliceCropView() {
  const {
    state,
    patch,
    patchInsets,
    loadSource,
    clearSession,
    exportCrop,
  } = useNineSliceCrop();

  const hasSource = !!state.source;
  const sumInset =
    state.insets.l + state.insets.t + state.insets.r + state.insets.b;
  const hasAnyInset = sumInset > 0;
  const activeTemplate = deriveTemplate(state.insets);

  const canExport =
    hasSource &&
    hasAnyInset &&
    !!state.outputDir &&
    !!state.outputName &&
    !state.exporting;

  usePrimaryAction(canExport, () => void exportCrop());

  // 导出完成弹 toast
  const toast = useToast();
  const wasExportingRef = useRef(false);
  useEffect(() => {
    if (wasExportingRef.current && !state.exporting) {
      if (state.exportResult) {
        const r = state.exportResult;
        toast.push({
          type: "success",
          message: `裁切完成：${r.outputSize.w}×${r.outputSize.h}，省了 ${(r.savedRatio * 100).toFixed(1)}%`,
        });
      } else if (state.exportError) {
        toast.push({ type: "error", message: `导出失败：${state.exportError}` });
      }
    }
    wasExportingRef.current = state.exporting;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exporting]);

  const handlePickFile = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] },
    ]);
    if (!picked) return;
    try {
      const meta = await readImageMeta(picked);
      const name = picked.split(/[\\/]/).pop() || "image.png";
      loadSource({ path: picked, name, width: meta.width, height: meta.height });
    } catch (e) {
      toast.push({
        type: "error",
        message: `读取图片失败：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const handlePickOutputDir = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  // 模板按钮：按图像尺寸推荐合理初值
  const applyTemplate = (kind: "9slice" | "3h" | "3v" | "clear") => {
    if (!state.source) return;
    const w = state.source.width;
    const h = state.source.height;
    // 默认推荐：尺寸的 12%，下限 8px（避免极小图归零），上限 96px（避免极大图喧宾夺主）
    // 在 750×956 这种典型 UI 资源上 → sideX=90 / sideY=114，模板按下立即能看到 4 个角
    const sideX = Math.max(8, Math.min(96, Math.floor(w * 0.12)));
    const sideY = Math.max(8, Math.min(96, Math.floor(h * 0.12)));
    switch (kind) {
      case "9slice":
        patchInsets({ l: sideX, t: sideY, r: sideX, b: sideY });
        break;
      case "3h":
        patchInsets({ l: sideX, t: 0, r: sideX, b: 0 });
        break;
      case "3v":
        patchInsets({ l: 0, t: sideY, r: 0, b: sideY });
        break;
      case "clear":
        patchInsets({ l: 0, t: 0, r: 0, b: 0 });
        break;
    }
  };

  const onInsetInput = (key: "l" | "t" | "r" | "b") => (e: Event) => {
    const value = Math.max(
      0,
      Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0),
    );
    patchInsets({ [key]: value });
  };

  // 摘要文案
  const summary = state.source
    ? hasAnyInset
      ? state.analysis
        ? `输出 ${state.analysis.outputSize.w}×${state.analysis.outputSize.h} · 省 ${formatRatio(state.analysis.savedRatio)} · 还原误差 ${formatRatio(state.analysis.restoreError.diffRatio)}`
        : state.analyzing
          ? "分析中..."
          : ""
      : "拖拽 4 条辅助线 / 或点模板按钮"
    : "导入图片开始";

  const errorRatio = state.analysis?.restoreError.diffRatio ?? 0;
  const errorBadgeClass =
    errorRatio < 0.01
      ? "is-safe"
      : errorRatio < 0.05
        ? "is-warn"
        : "is-danger";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>九宫格裁切</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 主舞台：左编辑 / 右预览 */}
        <section class={`nine-slice-stage ${hasSource ? "" : "is-empty"}`}>
          {!hasSource ? (
            <div class="empty-state">
              <div class="empty-state-illustration" aria-hidden="true" />
              <strong>导入一张图开始</strong>
              <span>支持 PNG / JPG / WebP — 对话框、按钮、面板的成品图</span>
              <button
                class="action-button action-primary"
                style={{ marginTop: "16px" }}
                onClick={() => void handlePickFile()}
              >
                选择图片
              </button>
            </div>
          ) : (
            <>
              <div class="nine-slice-editor-wrap">
                <NineSliceEditor
                  imagePath={state.source!.path}
                  imageWidth={state.source!.width}
                  imageHeight={state.source!.height}
                  insets={state.insets}
                  onChange={patchInsets}
                />
                <div class="nine-slice-canvas-meta">
                  原图 {state.source!.width}×{state.source!.height} · {state.source!.name}
                </div>
              </div>

              <div class="nine-slice-preview-wrap">
                <div class="nine-slice-preview-tabs">
                  {PREVIEW_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      class={`atlas-page-tab ${state.previewMode === opt.value ? "is-active" : ""}`}
                      onClick={() => patch({ previewMode: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div class="nine-slice-preview-canvas">
                  <PreviewImage />
                </div>
                <div class="nine-slice-canvas-meta">
                  {state.previewMode === "original"
                    ? "原图视觉参考"
                    : state.previewMode === "restored"
                      ? "用裁后小图按 9-slice 拉伸还原回原尺寸"
                      : "Diff：红色 = 还原偏差超阈值的像素"}
                </div>
              </div>
            </>
          )}
        </section>

        {/* 操作栏 */}
        {hasSource && (
          <section class="action-bar">
            <div class="action-entry">
              <button
                class="action-button action-primary"
                onClick={() => void handlePickFile()}
              >
                换一张
              </button>
              <button
                class={`action-button action-secondary ${activeTemplate === "9slice" ? "is-active" : ""}`}
                onClick={() => applyTemplate("9slice")}
                disabled={!hasSource}
                title="4 个 inset 都设值，4 角不变形（圆角对话框 / 面板 / 按钮）"
              >
                9-slice
              </button>
              <button
                class={`action-button action-secondary ${activeTemplate === "3h" ? "is-active" : ""}`}
                onClick={() => applyTemplate("3h")}
                disabled={!hasSource}
                title="L=R 设值，T=B=0：左右两端不变形 ↔ 中间水平拉伸（按钮 / 水平进度条）"
              >
                横向 3-slice
              </button>
              <button
                class={`action-button action-secondary ${activeTemplate === "3v" ? "is-active" : ""}`}
                onClick={() => applyTemplate("3v")}
                disabled={!hasSource}
                title="T=B 设值，L=R=0：上下两端不变形 ↕ 中间垂直拉伸（竖直滚动条 / 侧边）"
              >
                竖向 3-slice
              </button>
            </div>
            <div class="action-meta">
              {state.analyzing && <Spinner />}
              {state.analysis && (
                <span class={`nine-slice-error-badge ${errorBadgeClass}`}>
                  还原误差 {formatRatio(state.analysis.restoreError.diffRatio)}
                </span>
              )}
            </div>
            <div class="action-group">
              <button class="ghost-button" onClick={clearSession}>
                清空
              </button>
              <button
                class="ghost-button"
                disabled={!canExport}
                onClick={() => void exportCrop()}
              >
                {state.exporting ? (
                  <>
                    <Spinner />
                    导出中...
                  </>
                ) : (
                  "导出小图 + 元数据"
                )}
              </button>
            </div>
          </section>
        )}

        {state.exporting && <ProgressBar progress={null} taskLabel="导出" />}

        {/* 参数面板 */}
        {hasSource && (
          <section class="settings-grid">
            <div class="settings-card">
              <span class="option-label">Insets (px)</span>
              <div class="settings-row">
                <label class="mini-field">
                  <span>L 左</span>
                  <input
                    type="number"
                    min="0"
                    max={state.source!.width - state.insets.r - 1}
                    value={state.insets.l}
                    onInput={onInsetInput("l")}
                  />
                </label>
                <label class="mini-field">
                  <span>T 上</span>
                  <input
                    type="number"
                    min="0"
                    max={state.source!.height - state.insets.b - 1}
                    value={state.insets.t}
                    onInput={onInsetInput("t")}
                  />
                </label>
                <label class="mini-field">
                  <span>R 右</span>
                  <input
                    type="number"
                    min="0"
                    max={state.source!.width - state.insets.l - 1}
                    value={state.insets.r}
                    onInput={onInsetInput("r")}
                  />
                </label>
                <label class="mini-field">
                  <span>B 下</span>
                  <input
                    type="number"
                    min="0"
                    max={state.source!.height - state.insets.t - 1}
                    value={state.insets.b}
                    onInput={onInsetInput("b")}
                  />
                </label>
              </div>
              <span class="param-hint">
                任意 inset = 0 表示该方向不切。拖辅助线 / 数字输入 / 方向键微调（聚焦辅助线后）
              </span>
            </div>

            <div class="settings-card">
              <span class="option-label">中心保留 (px)</span>
              <div class="settings-row">
                <label class="mini-field">
                  <span>X</span>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={state.centerKeep.x}
                    onInput={(e) =>
                      patch({
                        centerKeep: {
                          ...state.centerKeep,
                          x: Math.max(
                            1,
                            Math.floor(
                              Number((e.currentTarget as HTMLInputElement).value) || 1,
                            ),
                          ),
                        },
                      })
                    }
                  />
                </label>
                <label class="mini-field">
                  <span>Y</span>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={state.centerKeep.y}
                    onInput={(e) =>
                      patch({
                        centerKeep: {
                          ...state.centerKeep,
                          y: Math.max(
                            1,
                            Math.floor(
                              Number((e.currentTarget as HTMLInputElement).value) || 1,
                            ),
                          ),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <span class="param-hint">
                通常 1px 够用；2~3px 可避免双线性采样的边缘 bleeding
              </span>
            </div>

            <div class="settings-card">
              <span class="option-label">中心策略</span>
              <div class="mode-line">
                <label class="radio-row">
                  <input
                    type="radio"
                    name="ns-center"
                    checked={state.center === "stretch"}
                    onChange={() => patch({ center: "stretch" })}
                  />
                  <span>拉伸</span>
                </label>
                <label class="radio-row">
                  <input
                    type="radio"
                    name="ns-center"
                    checked={state.center === "tile"}
                    onChange={() => patch({ center: "tile" })}
                  />
                  <span>平铺</span>
                </label>
              </div>
              <span class="param-hint">
                只写进元数据给引擎读，工具裁切动作两者一致
              </span>
            </div>
          </section>
        )}

        {/* 输出面板 */}
        {hasSource && (
          <section class="settings-grid">
            <div class="settings-card">
              <span class="option-label">输出文件名</span>
              <label class="mini-field" style={{ width: "100%" }}>
                <span style={{ visibility: "hidden" }}>stem</span>
                <input
                  type="text"
                  value={state.outputName}
                  onInput={(e) =>
                    patch({
                      outputName: (e.currentTarget as HTMLInputElement).value,
                    })
                  }
                />
              </label>
              <span class="param-hint">
                生成 <code>{state.outputName}.png</code> +{" "}
                <code>{state.outputName}.9slice.json</code>
              </span>
            </div>

            <div class="settings-card">
              <span class="option-label">输出目录</span>
              <button
                class={`path-button ${state.outputDir ? "" : "is-empty"}`}
                onClick={() => void handlePickOutputDir()}
              >
                {state.outputDir ? formatPath(state.outputDir) : "选择目录..."}
              </button>
            </div>
          </section>
        )}

        {state.analysisError && (
          <section class="compat-warning" role="alert">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.analysisError}</span>
          </section>
        )}

        {state.exportError && (
          <section class="compat-warning" role="alert">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.exportError}</span>
          </section>
        )}

        {state.exportResult && (
          <section class="summary-banner" role="status">
            <span>
              原图 {state.exportResult.originalSize.w}×
              {state.exportResult.originalSize.h}
            </span>
            <span>
              小图 {state.exportResult.outputSize.w}×
              {state.exportResult.outputSize.h}
            </span>
            <strong>省 {formatRatio(state.exportResult.savedRatio)}</strong>
            <button
              class="path-button"
              onClick={() =>
                void window.simpleImage.core.fs.revealInFolder(
                  state.exportResult!.croppedImagePath,
                )
              }
            >
              在 Finder 中显示
            </button>
          </section>
        )}
      </div>
    </section>
  );
}

// 预览图：根据 previewMode 选 img src
function PreviewImage() {
  const { state } = useNineSliceCrop();
  if (!state.source) return null;

  if (state.previewMode === "original") {
    return (
      <img
        class="nine-slice-preview-img"
        src={pathToFileUrl(state.source.path)}
        alt="原图"
      />
    );
  }
  if (state.previewMode === "restored") {
    if (!state.analysis) {
      return (
        <div class="nine-slice-preview-placeholder">
          {state.analyzing ? "分析中..." : "拖辅助线开始"}
        </div>
      );
    }
    return (
      <img
        class="nine-slice-preview-img"
        src={state.analysis.restoredImageDataUri}
        alt="还原图"
      />
    );
  }
  // diff
  if (!state.analysis) {
    return (
      <div class="nine-slice-preview-placeholder">
        {state.analyzing ? "分析中..." : "拖辅助线开始"}
      </div>
    );
  }
  return (
    <img
      class="nine-slice-preview-img"
      src={state.analysis.diffImageDataUri}
      alt="Diff"
    />
  );
}
