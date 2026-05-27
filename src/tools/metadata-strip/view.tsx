import { useEffect, useRef } from "preact/hooks";
import { FileImportZone } from "../../components/file-import";
import { ResultList } from "../../components/result-list";
import { ProgressBar } from "../../components/progress-bar";
import { Spinner } from "../../components/spinner";
import { useToast } from "../../shared/toast";
import { usePrimaryAction } from "../../shared/use-primary-action";
import {
  formatPath,
  formatRatio,
  formatSize,
  sumBy,
} from "../../shared/format";
import { useMetadataStrip } from "./state";

const DROP_HINT = "支持 JPG / PNG / WebP / GIF；剥离时按原格式重编码";

export function MetadataStripView() {
  const { state, patch, importFiles, clearSession, run, retryItem } =
    useMetadataStrip();

  const hasFiles = state.files.length > 0;
  const hasResults = state.results.length > 0;
  const isEmpty = !hasFiles && !hasResults;
  const totalSize = state.files.reduce((s, f) => s + f.size, 0);
  const succeededResults = state.results.filter(
    (r) => r.status === "done" && typeof r.outputSize === "number",
  );
  const doneCount = succeededResults.length;
  const failedCount = state.results.filter((r) => r.status === "failed").length;
  const totalOriginalSize = sumBy(succeededResults, (r) => r.size);
  const totalOutputSize = sumBy(succeededResults, (r) => r.outputSize ?? 0);
  const savedBytes = Math.max(0, totalOriginalSize - totalOutputSize);
  const savedRatio = totalOriginalSize > 0 ? savedBytes / totalOriginalSize : 0;

  const currentFiles = hasResults ? state.results : state.files;

  const canRun =
    !state.running &&
    hasFiles &&
    (state.saveMode !== "custom" || !!state.outputDir);

  usePrimaryAction(canRun, () => void run());

  // 跑完弹 toast
  const toast = useToast();
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !state.running && state.results.length > 0) {
      const s = state.results.filter((r) => r.status === "done").length;
      const f = state.results.filter((r) => r.status === "failed").length;
      if (f === 0) {
        toast.push({
          type: "success",
          message: `剥离完成：${s} 个文件${
            savedBytes > 0 ? `，省了 ${formatSize(savedBytes)}` : ""
          }`,
        });
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
    const picked = (await window.simpleImage.core.fs.pickFiles()).filter(
      (f) => f.supported,
    );
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
        <strong>元数据剥离</strong>
        <span>批量去除 EXIF / GPS / IPTC / XMP</span>
      </div>

      <div class="tuya-content">
        <section
          class={`stage-panel ${isEmpty ? "stage-panel-empty" : ""}`}
        >
          <FileImportZone
            empty={isEmpty}
            emptyTitle="拖入图片开始剥离"
            emptyDefaultHint={DROP_HINT}
            onPathsDropped={(paths) => void handlePathsDropped(paths)}
          >
            <ResultList
              items={currentFiles}
              actions={
                hasResults
                  ? {
                      onOpenOutput: (file) => {
                        if (file.outputPath) {
                          void window.simpleImage.core.fs.openPath(
                            file.outputPath,
                          );
                        }
                      },
                      onRevealInFolder: (file) => {
                        if (file.outputPath) {
                          void window.simpleImage.core.fs.revealInFolder(
                            file.outputPath,
                          );
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
            <button
              class="action-button action-primary"
              onClick={() => void handlePickFiles()}
            >
              添加图片
            </button>
            <button
              class="action-button action-secondary"
              onClick={() => void handlePickFolder()}
            >
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{hasFiles ? `${state.files.length} 个文件` : "等待导入"}</span>
            <span>
              {hasFiles ? formatSize(totalSize) : "支持 JPG / PNG / WebP / GIF"}
            </span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!hasFiles && !hasResults}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canRun}
              onClick={() => void run()}
            >
              {state.running ? (
                <>
                  <Spinner />
                  剥离中...
                </>
              ) : (
                "开始剥离"
              )}
            </button>
          </div>
        </section>

        {state.running && (
          <ProgressBar progress={state.progress} taskLabel="剥离" />
        )}

        <section class="settings-grid">
          <div class="settings-card">
            <span class="option-label">保留选项</span>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={state.preserveColorProfile}
                onChange={(e) =>
                  patch({
                    preserveColorProfile: (e.currentTarget as HTMLInputElement)
                      .checked,
                  })
                }
              />
              <span>保留色彩 (ICC profile)</span>
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={state.preserveOrientation}
                onChange={(e) =>
                  patch({
                    preserveOrientation: (e.currentTarget as HTMLInputElement)
                      .checked,
                  })
                }
              />
              <span>保留方向 (EXIF Orientation)</span>
            </label>
            <span class="param-hint">
              关掉色彩：不同显示器看色彩可能偏；关掉方向：手机拍的图可能倒过来。
              不确定就两个都开。
            </span>
          </div>

          <div class="settings-card">
            <span class="option-label">保存路径</span>
            <div class="option-list">
              <label class="radio-chip">
                <input
                  type="radio"
                  name="strip-save"
                  checked={state.saveMode === "source"}
                  onChange={() => patch({ saveMode: "source" })}
                />
                <span>原文件夹</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="strip-save"
                  checked={state.saveMode === "overwrite-source"}
                  onChange={() => patch({ saveMode: "overwrite-source" })}
                />
                <span>覆盖原文件</span>
              </label>
              <label class="radio-chip">
                <input
                  type="radio"
                  name="strip-save"
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
            {state.saveMode === "overwrite-source" && (
              <span class="param-hint">
                ⚠ 覆盖会直接重写原文件（先写临时文件再 rename，过程安全）
              </span>
            )}
          </div>
        </section>

        {hasResults && (
          <section class="summary-banner" role="status">
            <span>成功 {doneCount}</span>
            <span>失败 {failedCount}</span>
            <span>原始 {formatSize(totalOriginalSize)}</span>
            <span>输出 {formatSize(totalOutputSize)}</span>
            <strong>
              省了 {formatSize(savedBytes)} · {formatRatio(savedRatio)}
            </strong>
          </section>
        )}
      </div>
    </section>
  );
}
