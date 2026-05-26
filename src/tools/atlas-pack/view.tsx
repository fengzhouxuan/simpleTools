import { FileImportZone } from "../../components/file-import";
import { ProgressBar } from "../../components/progress-bar";
import { CopyPathButton } from "../../components/copy-path-button";
import { Spinner } from "../../components/spinner";
import { usePrimaryAction } from "../../shared/use-primary-action";
import { useAtlasPack } from "./state";
import { AtlasPreview } from "./preview";
import { AtlasPresetBar } from "./preset-bar";

const DROP_HINT = "拖入小图（JPG / PNG / WebP）开始打包";

const FORMAT_LABELS: Record<string, string> = {
  "json-hash": "TexturePacker JSON",
  "json-array": "JSON Array",
  plist: "Cocos2d-x plist",
  css: "CSS Sprite",
};

export function AtlasPackView() {
  const { state, patch, importInputs, clearSession, exportAtlas } = useAtlasPack();
  const hasInputs = state.inputs.length > 0;
  const result = state.packResult;
  const isEmpty = !hasInputs;

  const handlePickFiles = async () => {
    const picked = (await window.simpleImage.core.fs.pickFiles()).filter(
      (f) => f.supported && f.ext !== ".svg",
    );
    importInputs(picked);
  };

  const handlePickFolder = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (!dir) return;
    importInputs(await window.simpleImage.core.fs.scanDirectory(dir));
  };

  const handlePathsDropped = async (paths: string[]) => {
    const files = await window.simpleImage.core.fs.normalizePaths(paths);
    importInputs(files);
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const canExport =
    hasInputs && !!state.outputDir && !state.exporting && !state.packing && !!result;

  usePrimaryAction(canExport, () => void exportAtlas());

  const summary = result
    ? `${result.pages.length} 页 · 利用率 ${(result.totalUtilization * 100).toFixed(1)}% · 共 ${result.pages.reduce((s, p) => s + p.frames.length, 0)} 个子图`
    : state.packing
      ? "计算中..."
      : "等待打包";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图集打包</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 文件区 + 预览：左右双栏 */}
        <section class="atlas-stage">
          <div class="atlas-stage-left">
            <FileImportZone
              empty={isEmpty}
              emptyTitle="拖入小图开始打包"
              emptyDefaultHint={DROP_HINT}
              onPathsDropped={(paths) => void handlePathsDropped(paths)}
            >
              <div class="atlas-input-list">
                {state.inputs.map((it) => (
                  <div key={it.path} class="atlas-input-row" title={it.path}>
                    <span class="atlas-input-name">{it.name}</span>
                  </div>
                ))}
              </div>
            </FileImportZone>
          </div>
          <div class="atlas-stage-right">
            <AtlasPreview result={result} />
          </div>
        </section>

        {/* 操作栏 */}
        <section class="action-bar">
          <div class="action-entry">
            <button class="action-button action-primary" onClick={() => void handlePickFiles()}>
              添加小图
            </button>
            <button class="action-button action-secondary" onClick={() => void handlePickFolder()}>
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{hasInputs ? `${state.inputs.length} 个文件` : "等待导入"}</span>
          </div>
          <div class="action-group">
            <button class="ghost-button" disabled={!hasInputs} onClick={clearSession}>
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canExport}
              onClick={() => void exportAtlas()}
            >
              {state.exporting ? (<><Spinner />导出中...</>) : "导出图集"}
            </button>
          </div>
        </section>

        {state.exporting && (
          <ProgressBar progress={state.progress} taskLabel="导出" />
        )}

        <AtlasPresetBar />

        {/* 参数面板 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>最大宽度</span>
                <input
                  type="number"
                  min="64"
                  step="64"
                  value={state.maxWidth}
                  onInput={(e) =>
                    patch({
                      maxWidth: Math.max(
                        64,
                        Number((e.currentTarget as HTMLInputElement).value) || 64,
                      ),
                    })
                  }
                />
              </label>
              <label class="mini-field">
                <span>最大高度</span>
                <input
                  type="number"
                  min="64"
                  step="64"
                  value={state.maxHeight}
                  onInput={(e) =>
                    patch({
                      maxHeight: Math.max(
                        64,
                        Number((e.currentTarget as HTMLInputElement).value) || 64,
                      ),
                    })
                  }
                />
              </label>
            </div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={state.pot}
                onChange={(e) =>
                  patch({ pot: (e.currentTarget as HTMLInputElement).checked })
                }
              />
              <span>POT（2 的幂尺寸）</span>
            </label>
          </div>

          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>子图间距 (px)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={state.padding}
                  onInput={(e) =>
                    patch({
                      padding: Math.max(
                        0,
                        Number((e.currentTarget as HTMLInputElement).value) || 0,
                      ),
                    })
                  }
                />
              </label>
              <label class="mini-field">
                <span>输出名</span>
                <input
                  type="text"
                  value={state.outputName}
                  onInput={(e) =>
                    patch({
                      outputName:
                        (e.currentTarget as HTMLInputElement).value.trim() || "atlas",
                    })
                  }
                />
              </label>
            </div>
            <div class="mode-line" style={{ marginTop: "10px" }}>
              <label class="radio-row">
                <input
                  type="checkbox"
                  checked={state.trim}
                  onChange={(e) =>
                    patch({ trim: (e.currentTarget as HTMLInputElement).checked })
                  }
                />
                <span>去 alpha 边</span>
              </label>
              <label class="radio-row">
                <input
                  type="checkbox"
                  checked={state.allowRotate}
                  onChange={(e) =>
                    patch({
                      allowRotate: (e.currentTarget as HTMLInputElement).checked,
                    })
                  }
                />
                <span>允许旋转</span>
              </label>
            </div>
          </div>
        </section>

        {/* 高级：元数据格式 + 输出路径 */}
        <section class="advanced-panel">
          <div class="option-block">
            <span class="option-label">元数据格式</span>
            <div class="option-list">
              {(["json-hash", "json-array", "plist", "css"] as const).map((fmt) => (
                <label key={fmt} class="radio-chip">
                  <input
                    type="radio"
                    name="atlas-format"
                    checked={state.format === fmt}
                    onChange={() => patch({ format: fmt })}
                  />
                  <span>{FORMAT_LABELS[fmt]}</span>
                </label>
              ))}
            </div>
          </div>
          <div class="option-block">
            <span class="option-label">输出目录</span>
            <button class="path-button" onClick={() => void handlePickOutput()}>
              {state.outputDir || "选择目录..."}
            </button>
          </div>
        </section>

        {state.lastError && (
          <section class="compat-warning">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.lastError}</span>
          </section>
        )}

        {state.lastExport && state.lastExport.pageImagePaths.length > 0 && (
          <section class="summary-banner">
            <strong>导出完成</strong>
            <span>
              {state.lastExport.pageImagePaths.length} 张图集 +{" "}
              {state.lastExport.metadataPaths.length} 份元数据
            </span>
            <span class="summary-spacer" />
            <CopyPathButton text={state.lastExport.pageImagePaths[0]} />
            <button
              class="ghost-button"
              onClick={() => {
                const first = state.lastExport?.pageImagePaths[0];
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
