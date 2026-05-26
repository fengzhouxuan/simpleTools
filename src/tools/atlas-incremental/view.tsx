import { FileImportZone } from "../../components/file-import";
import {
  guessAtlasForMetadata,
  guessMetadataForAtlas,
} from "../../shared/sibling-guess";
import { useAtlasIncremental } from "./state";

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

const FORMAT_LABELS: Record<string, string> = {
  "json-hash": "TexturePacker JSON",
  "json-array": "JSON Array",
  plist: "Cocos2d-x plist",
  css: "CSS Sprite",
};

export function AtlasIncrementalView() {
  const { state, patch, importSources, clearSession, runExport } = useAtlasIncremental();
  const { diff, manifestInfo } = state;
  const hasSources = state.newSources.length > 0;
  const isEmpty = !hasSources;

  const handlePickAtlas = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Image", extensions: ["png", "jpg", "jpeg", "webp"] },
    ]);
    if (!picked) return;
    const autoMetadata =
      state.metadataPath || (await guessMetadataForAtlas(picked)) || "";
    patch({ atlasPath: picked, metadataPath: autoMetadata });
  };

  const handlePickMetadata = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Metadata", extensions: ["plist", "json", "css"] },
    ]);
    if (!picked) return;
    const autoAtlas =
      state.atlasPath || (await guessAtlasForMetadata(picked)) || "";
    patch({ metadataPath: picked, atlasPath: autoAtlas });
  };

  const handlePickFiles = async () => {
    const picked = (await window.simpleImage.core.fs.pickFiles()).filter(
      (f) => f.supported && f.ext !== ".svg",
    );
    importSources(picked);
  };

  const handlePickFolder = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (!dir) return;
    importSources(await window.simpleImage.core.fs.scanDirectory(dir));
  };

  const handlePathsDropped = async (paths: string[]) => {
    const files = await window.simpleImage.core.fs.normalizePaths(paths);
    importSources(files);
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const oldLoaded = !!state.atlasPath && !!state.metadataPath;
  const canExport = oldLoaded && !!state.outputDir && !!diff && !state.exporting;

  const summary = diff
    ? `+${diff.added.length} 改${diff.modified.length} 复用${diff.unchanged.length}`
    : state.inspecting
      ? "解析中..."
      : "选择旧图集与新散图";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图集增量打包</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 旧图集输入：atlas + 元数据 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">旧 atlas 图片</span>
              <button
                class={`path-button ${state.atlasPath ? "" : "is-empty"}`}
                onClick={() => void handlePickAtlas()}
              >
                {basename(state.atlasPath) || "选择 atlas.png..."}
              </button>
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">旧元数据</span>
              <button
                class={`path-button ${state.metadataPath ? "" : "is-empty"}`}
                onClick={() => void handlePickMetadata()}
              >
                {basename(state.metadataPath) || "选择 atlas.json / .plist / .css..."}
              </button>
              <span class="param-hint">
                选一边会自动尝试同目录同名匹配另一边
              </span>
            </div>
          </div>
        </section>

        {/* 状态 + 输出目录 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">旧图集加载</span>
              {manifestInfo ? (
                <span class="param-hint" style={{ color: "var(--text-primary)" }}>
                  ✓ {FORMAT_LABELS[manifestInfo.format] || manifestInfo.format} ·{" "}
                  {manifestInfo.total} 个旧子图
                </span>
              ) : state.inspecting ? (
                <span class="param-hint">解析中...</span>
              ) : state.atlasPath && !state.metadataPath ? (
                <span class="param-hint" style={{ color: "var(--accent)" }}>
                  ⚠ 还需要选元数据文件
                </span>
              ) : !state.atlasPath && state.metadataPath ? (
                <span class="param-hint" style={{ color: "var(--accent)" }}>
                  ⚠ 还需要选 atlas 图片
                </span>
              ) : (
                <span class="param-hint">先选择旧 atlas + 旧元数据</span>
              )}
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
          </div>
        </section>

        {/* 新散图导入区 */}
        <section class="stage-panel" style={{ minHeight: isEmpty ? "180px" : "240px" }}>
          <FileImportZone
            empty={isEmpty}
            emptyTitle="拖入要新增 / 替换的散图"
            emptyDefaultHint="工具会把旧 atlas 拆开 → 跟这些散图合并 → 全量重打一张新 atlas"
            onPathsDropped={(paths) => void handlePathsDropped(paths)}
          >
            <div class="atlas-input-list">
              {state.newSources.map((it) => (
                <div key={it.path} class="atlas-input-row" title={it.path}>
                  <span class="atlas-input-name">{it.name}</span>
                </div>
              ))}
            </div>
          </FileImportZone>
        </section>

        {/* 差异面板：3 个 chip，无"删除" */}
        {diff && (
          <section class="diff-grid diff-grid-3">
            <div class={`diff-chip diff-added`}>
              <strong>{diff.added.length}</strong>
              <span>新增</span>
            </div>
            <div class={`diff-chip diff-modified`}>
              <strong>{diff.modified.length}</strong>
              <span>修改（同名覆盖）</span>
            </div>
            <div class={`diff-chip diff-unchanged`}>
              <strong>{diff.unchanged.length}</strong>
              <span>复用（旧 atlas 拆出）</span>
            </div>
          </section>
        )}

        {/* 操作栏 */}
        <section class="action-bar">
          <div class="action-entry">
            <button
              class="action-button action-primary"
              onClick={() => void handlePickFiles()}
            >
              添加新散图
            </button>
            <button
              class="action-button action-secondary"
              onClick={() => void handlePickFolder()}
            >
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{hasSources ? `${state.newSources.length} 个新散图` : "可选：导入要加/改的散图"}</span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!hasSources && !state.atlasPath}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canExport}
              onClick={() => void runExport()}
            >
              {state.exporting ? "重打中..." : "生成新图集"}
            </button>
          </div>
        </section>

        {/* 重打参数 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>最大宽</span>
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
                <span>最大高</span>
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
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>padding</span>
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
              <label class="radio-row">
                <input
                  type="checkbox"
                  checked={state.pot}
                  onChange={(e) =>
                    patch({ pot: (e.currentTarget as HTMLInputElement).checked })
                  }
                />
                <span>POT</span>
              </label>
            </div>
          </div>
        </section>

        <section class="advanced-panel">
          <div class="option-block">
            <span class="option-label">元数据格式</span>
            <div class="option-list">
              {(["json-hash", "json-array", "plist", "css"] as const).map((fmt) => (
                <label key={fmt} class="radio-chip">
                  <input
                    type="radio"
                    name="atlas-inc-format"
                    checked={state.format === fmt}
                    onChange={() => patch({ format: fmt })}
                  />
                  <span>{FORMAT_LABELS[fmt]}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {state.lastError && (
          <section class="compat-warning">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.lastError}</span>
          </section>
        )}

        {state.lastExport && (
          <section class="summary-banner">
            <strong>新图集已生成</strong>
            <span>
              {state.lastExport.pageImagePaths.length} 张 atlas ·{" "}
              {state.lastExport.metadataPaths.length} 份元数据
            </span>
            <span class="summary-spacer" />
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
