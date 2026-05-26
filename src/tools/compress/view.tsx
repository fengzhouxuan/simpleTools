import {
  formatPath,
  formatRatio,
  formatSize,
  sumBy,
} from "../../shared/format";
import { FileImportZone } from "../../components/file-import";
import { ResultList } from "../../components/result-list";
import { ProgressBar } from "../../components/progress-bar";
import { usePrimaryAction } from "../../shared/use-primary-action";
import { getQualityLevel, useCompressState } from "./state";
import { PresetBar } from "./preset-bar";

const COMPRESS_DROP_HINT = "支持从 Finder 直接拖入 JPG / PNG / GIF / SVG 文件";

export function CompressView() {
  const {
    state,
    patch,
    importFiles,
    clearSession,
    runCompression,
    retryItem,
    setQualityFromLevel,
  } = useCompressState();

  const totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
  const doneCount = state.results.filter((item) => item.status === "done").length;
  const failedCount = state.results.filter((item) => item.status === "failed").length;
  const succeededResults = state.results.filter(
    (item) => item.status === "done" && typeof item.outputSize === "number",
  );
  const hasFiles = state.files.length > 0;
  const hasResults = state.results.length > 0;
  const totalOriginalSize = sumBy(succeededResults, (item) => item.size);
  const totalOutputSize = sumBy(succeededResults, (item) => item.outputSize ?? 0);
  const savedBytes = Math.max(0, totalOriginalSize - totalOutputSize);
  const savedRatio = totalOriginalSize > 0 ? savedBytes / totalOriginalSize : 0;
  const qualityLevel = getQualityLevel(state.quality);
  const currentFiles = hasResults ? state.results : state.files;
  const isEmptyStage = currentFiles.length === 0;
  const hasGifOrSvg =
    hasFiles && state.files.some((f) => f.ext === ".gif" || f.ext === ".svg");
  const incompatibleCount =
    state.outputFormat !== "original"
      ? state.files.filter((f) => f.ext === ".gif" || f.ext === ".svg").length
      : 0;
  const outputFormatLabel =
    state.outputFormat === "webp"
      ? "WebP"
      : state.outputFormat === "jpg"
        ? "JPG"
        : state.outputFormat === "png"
          ? "PNG"
          : "";
  const canRun =
    !state.running &&
    state.files.length > 0 &&
    (state.saveMode !== "custom" || Boolean(state.outputDir));

  usePrimaryAction(canRun, () => void runCompression());

  const handlePickFiles = async () => {
    const picked = (await window.simpleImage.core.fs.pickFiles()).filter((f) => f.supported);
    importFiles(picked);
  };

  const handlePickFolder = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (!dir) return;
    importFiles(await window.simpleImage.core.fs.scanDirectory(dir));
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const handlePathsDropped = async (paths: string[]) => {
    const files = await window.simpleImage.core.fs.normalizePaths(paths);
    importFiles(files);
  };

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图片压缩</strong>
        <span>当前主工具模块</span>
      </div>
      <div class="tuya-content">
        <section class={`stage-panel ${isEmptyStage ? "stage-panel-empty" : ""}`}>
          <FileImportZone
            empty={isEmptyStage}
            emptyTitle="拖入图片开始压缩"
            emptyDefaultHint={COMPRESS_DROP_HINT}
            onPathsDropped={(paths) => void handlePathsDropped(paths)}
          >
            <ResultList
              items={currentFiles}
              actions={
                hasResults
                  ? {
                      onOpenOutput: (file) => {
                        if (file.outputPath) {
                          void window.simpleImage.core.fs.openPath(file.outputPath);
                        }
                      },
                      onRevealInFolder: (file) => {
                        if (file.outputPath) {
                          void window.simpleImage.core.fs.revealInFolder(file.outputPath);
                        }
                      },
                      onRetry: (file) => retryItem(file),
                    }
                  : undefined
              }
            />
          </FileImportZone>
        </section>

        <section class="action-bar">
          <div class="action-entry">
            <button class="action-button action-primary" onClick={() => void handlePickFiles()}>
              添加图片
            </button>
            <button class="action-button action-secondary" onClick={() => void handlePickFolder()}>
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{hasFiles ? `${state.files.length} 个文件` : "等待导入"}</span>
            <span>{hasFiles ? formatSize(totalSize) : "支持 JPG / PNG / GIF / SVG"}</span>
          </div>
          <div class="action-group">
            <button class="ghost-button" disabled={!hasFiles} onClick={clearSession}>
              清空列表
            </button>
            <button
              class="ghost-button"
              disabled={!canRun}
              onClick={() => void runCompression()}
            >
              {state.running ? "压缩中..." : "再次压缩"}
            </button>
          </div>
        </section>

        {state.running && <ProgressBar progress={state.progress} taskLabel="压缩" />}

        <PresetBar />

        {incompatibleCount > 0 && (
          <section class="compat-warning">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">
              {incompatibleCount} 个 GIF/SVG 文件无法导出为 {outputFormatLabel}，跑压缩时会失败
            </span>
            <button
              class="compat-action"
              onClick={() => patch({ outputFormat: "original" })}
            >
              改回原格式
            </button>
          </section>
        )}

        <section class="settings-grid">
          <div class="settings-card dimensions-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>宽度</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={state.resizeWidth}
                  placeholder="自动"
                  onInput={(e) =>
                    patch({ resizeWidth: (e.currentTarget as HTMLInputElement).value })
                  }
                />
              </label>
              <label class="mini-field">
                <span>高度</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={state.resizeHeight}
                  placeholder="自动"
                  onInput={(e) =>
                    patch({ resizeHeight: (e.currentTarget as HTMLInputElement).value })
                  }
                />
              </label>
            </div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={state.preserveAspect}
                onChange={(e) =>
                  patch({ preserveAspect: (e.currentTarget as HTMLInputElement).checked })
                }
              />
              <span>保持原始宽高比</span>
            </label>
            <div class={`resize-mode-row ${state.preserveAspect ? "is-disabled" : ""}`}>
              <label class="radio-row">
                <input
                  type="radio"
                  name="resize-mode"
                  checked={state.resizeMode === "stretch"}
                  disabled={state.preserveAspect}
                  onChange={() => patch({ resizeMode: "stretch" })}
                />
                <span>拉伸</span>
              </label>
              <label class="radio-row">
                <input
                  type="radio"
                  name="resize-mode"
                  checked={state.resizeMode === "crop"}
                  disabled={state.preserveAspect}
                  onChange={() => patch({ resizeMode: "crop" })}
                />
                <span>裁剪</span>
              </label>
            </div>
          </div>

          <div class="settings-card compression-card">
            <div class="mode-line">
              <label class="radio-row">
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === "quality"}
                  onChange={() => patch({ mode: "quality" })}
                />
                <span>压缩强度</span>
              </label>
              <label class="radio-row">
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === "target-size"}
                  onChange={() => patch({ mode: "target-size" })}
                />
                <span>文件大小</span>
              </label>
            </div>
            <div class={`slider-wrap ${state.mode === "quality" ? "" : "is-hidden"}`}>
              <input
                type="range"
                min="1"
                max="10"
                value={String(qualityLevel)}
                onInput={(e) =>
                  setQualityFromLevel(Number((e.currentTarget as HTMLInputElement).value))
                }
              />
              <div class="slider-scale">
                {Array.from({ length: 10 }, (_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
              </div>
              {hasGifOrSvg && (
                <span class="param-hint">GIF 用此滑块控制颜色数（约 32 ~ 256）</span>
              )}
            </div>
            <div class={`target-wrap ${state.mode === "target-size" ? "" : "is-hidden"}`}>
              <label class="target-size-box">
                <span>目标大小</span>
                <div class="target-input">
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={state.targetSizeKB}
                    onInput={(e) =>
                      patch({
                        targetSizeKB: Math.max(
                          10,
                          Number((e.currentTarget as HTMLInputElement).value) || 10,
                        ),
                      })
                    }
                  />
                  <em>KB</em>
                </div>
              </label>
              {hasGifOrSvg && (
                <span class="param-hint">GIF 通过减少颜色数逼近目标体积，可能影响画质</span>
              )}
            </div>
          </div>
        </section>

        <section class="advanced-toggle">
          <button
            class="toggle-button"
            onClick={() => patch({ showAdvanced: !state.showAdvanced })}
          >
            {state.showAdvanced ? "收起更多设置" : "展开更多设置"}
          </button>
        </section>

        <section class={`advanced-panel ${state.showAdvanced ? "" : "is-hidden"}`}>
          <div class="option-block">
            <span class="option-label">目标格式</span>
            <div class="option-list">
              <label class="radio-chip">
                <input
                  type="radio"
                  name="format"
                  checked={state.outputFormat === "original"}
                  onChange={() => patch({ outputFormat: "original" })}
                />
                <span>原格式</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="format"
                  checked={state.outputFormat === "webp"}
                  disabled={hasGifOrSvg}
                  onChange={() => patch({ outputFormat: "webp" })}
                />
                <span>WebP</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="format"
                  checked={state.outputFormat === "png"}
                  disabled={hasGifOrSvg}
                  onChange={() => patch({ outputFormat: "png" })}
                />
                <span>PNG</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="format"
                  checked={state.outputFormat === "jpg"}
                  disabled={hasGifOrSvg}
                  onChange={() => patch({ outputFormat: "jpg" })}
                />
                <span>JPG</span>
              </label>
            </div>
          </div>

          <div class="option-block">
            <span class="option-label">保存路径</span>
            <div class="option-list">
              <label class="radio-chip">
                <input
                  type="radio"
                  name="save"
                  checked={state.saveMode === "source"}
                  onChange={() => patch({ saveMode: "source" })}
                />
                <span>原文件夹</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="save"
                  checked={state.saveMode === "overwrite-source"}
                  onChange={() => patch({ saveMode: "overwrite-source" })}
                />
                <span>覆盖原文件</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="save"
                  checked={state.saveMode === "custom"}
                  onChange={() => patch({ saveMode: "custom" })}
                />
                <span>自定义文件夹</span>
              </label>
              <button
                class="path-button"
                disabled={state.saveMode !== "custom"}
                onClick={() => void handlePickOutput()}
              >
                {state.outputDir ? formatPath(state.outputDir) : "选择文件夹"}
              </button>
            </div>
          </div>
        </section>

        {hasResults && (
          <section class="summary-banner">
            <span>成功 {doneCount}</span>
            <span>失败 {failedCount}</span>
            <span>原始 {formatSize(totalOriginalSize)}</span>
            <span>输出 {formatSize(totalOutputSize)}</span>
            <strong>
              本轮节省 {formatSize(savedBytes)} · {formatRatio(savedRatio)}
            </strong>
          </section>
        )}
      </div>
    </section>
  );
}
