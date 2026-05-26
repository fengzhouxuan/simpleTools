import { FileImportZone } from "../../components/file-import";
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

  const handlePickManifest = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Manifest", extensions: ["json"] },
    ]);
    if (!picked) return;
    // 选了精确 manifest → 清掉 fallback 输入避免冲突
    patch({ manifestPath: picked, atlasPath: "", metadataPath: "" });
  };

  const handlePickFallbackAtlas = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Image", extensions: ["png", "jpg", "jpeg", "webp"] },
    ]);
    if (!picked) return;
    patch({ atlasPath: picked, manifestPath: "" });
  };

  const handlePickFallbackMetadata = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Metadata", extensions: ["plist", "json", "css"] },
    ]);
    if (!picked) return;
    patch({ metadataPath: picked, manifestPath: "" });
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

  const hasOldInput =
    !!state.manifestPath || (!!state.atlasPath && !!state.metadataPath);
  const canExport =
    hasOldInput &&
    hasSources &&
    !!state.outputDir &&
    !!diff &&
    !state.exporting;

  const summary = diff
    ? `+${diff.added.length} 改${diff.modified.length} 删${diff.removed.length} 复用${diff.unchanged.length}`
    : state.inspecting
      ? "对比中..."
      : "选择旧 manifest 与新源图";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图集增量打包</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 旧版输入：两种模式 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">模式 A：精确（推荐）</span>
              <button class="path-button" onClick={() => void handlePickManifest()}>
                {basename(state.manifestPath) || "选择 atlas.manifest.json..."}
              </button>
              <span class="param-hint">
                选 <code>*.manifest.json</code>（atlas-pack 导出时生成的指纹文件）。
                能精确区分"未变 / 修改"，未变子图保留原坐标。
              </span>
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">模式 B：fallback（旧 atlas + 旧元数据）</span>
              <div class="fallback-pair">
                <button class="path-button" onClick={() => void handlePickFallbackAtlas()}>
                  {basename(state.atlasPath) || "旧 atlas.png..."}
                </button>
                <button class="path-button" onClick={() => void handlePickFallbackMetadata()}>
                  {basename(state.metadataPath) || "旧 atlas.json / .plist..."}
                </button>
              </div>
              <span class="param-hint">
                没有 manifest 时用这个。所有同名子图都视为"修改"重新打包，
                丢失"未变保留位置"的优势，但能处理任意旧图集。
              </span>
            </div>
          </div>
        </section>

        {/* manifest 加载状态 + 输出目录 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">旧版加载状态</span>
              {manifestInfo ? (
                <span class="param-hint" style={{ color: "var(--text-primary)" }}>
                  ✓ {FORMAT_LABELS[manifestInfo.format] || manifestInfo.format} · {manifestInfo.total} 个子图
                  {manifestInfo.fallback ? "（fallback 模式）" : "（精确模式）"}
                </span>
              ) : state.inspecting ? (
                <span class="param-hint">解析中...</span>
              ) : (
                <span class="param-hint">先选择上方"模式 A"或"模式 B"</span>
              )}
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">输出目录</span>
              <button class="path-button" onClick={() => void handlePickOutput()}>
                {state.outputDir || "选择目录..."}
              </button>
              <span class="param-hint">
                旧 atlas PNG 会被复制到这里；附加页与新 manifest 也写到这里
              </span>
            </div>
          </div>
        </section>

        {/* 新源图导入区 */}
        <section class="stage-panel" style={{ minHeight: isEmpty ? "180px" : "240px" }}>
          <FileImportZone
            empty={isEmpty}
            emptyTitle="拖入新版小图（完整集合）"
            emptyDefaultHint="工具会按文件名+内容 hash 自动比对差异"
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

        {/* 差异面板 */}
        {diff && (
          <section class="diff-grid">
            <div class={`diff-chip diff-added`}>
              <strong>{diff.added.length}</strong>
              <span>新增</span>
            </div>
            <div class={`diff-chip diff-modified`}>
              <strong>{diff.modified.length}</strong>
              <span>修改</span>
            </div>
            <div class={`diff-chip diff-removed`}>
              <strong>{diff.removed.length}</strong>
              <span>删除</span>
            </div>
            <div class={`diff-chip diff-unchanged`}>
              <strong>{diff.unchanged.length}</strong>
              <span>复用</span>
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
              添加新源图
            </button>
            <button
              class="action-button action-secondary"
              onClick={() => void handlePickFolder()}
            >
              扫描目录
            </button>
          </div>
          <div class="action-meta">
            <span>{hasSources ? `${state.newSources.length} 个新源` : "等待导入"}</span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!hasSources && !state.manifestPath}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canExport}
              onClick={() => void runExport()}
            >
              {state.exporting ? "导出中..." : "生成增量"}
            </button>
          </div>
        </section>

        {/* 参数（仅作用于附加页） */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>附加页最大宽</span>
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
                <span>附加页最大高</span>
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
            <strong>增量完成</strong>
            <span>
              附加页 {state.lastExport.patchImagePath ? "1" : "0"} 张 ·{" "}
              共 {state.lastExport.pageImagePaths.length} 页 ·{" "}
              {state.lastExport.metadataPaths.length} 份元数据
            </span>
            <span class="summary-spacer" />
            <button
              class="ghost-button"
              onClick={() => {
                const first =
                  state.lastExport?.patchImagePath ||
                  state.lastExport?.pageImagePaths[0];
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
