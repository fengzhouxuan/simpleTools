import { useAtlasUnpack } from "./state";

const FORMAT_LABEL: Record<string, string> = {
  "json-hash": "TexturePacker JSON",
  "json-array": "JSON Array",
  plist: "Cocos2d-x plist",
  css: "CSS Sprite",
};

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

// 选了 atlas 后，按"同目录同名"自动推断 metadata 路径
function guessMetadataPath(atlasPath: string): string {
  if (!atlasPath) return "";
  const dot = atlasPath.lastIndexOf(".");
  if (dot < 0) return "";
  return atlasPath.slice(0, dot) + ".json";
}

export function AtlasUnpackView() {
  const { state, patch, clearSession, exportUnpack } = useAtlasUnpack();
  const { inspect } = state;

  const handlePickAtlas = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Image", extensions: ["png", "jpg", "jpeg", "webp"] },
    ]);
    if (!picked) return;
    const guess = state.metadataPath || guessMetadataPath(picked);
    patch({ atlasPath: picked, metadataPath: guess });
  };

  const handlePickMetadata = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Atlas Metadata", extensions: ["plist", "json", "css"] },
    ]);
    if (picked) patch({ metadataPath: picked });
  };

  const handlePickOutput = async () => {
    const dir = await window.simpleImage.core.fs.pickFolder();
    if (dir) patch({ outputDir: dir });
  };

  const canExport =
    !!state.atlasPath &&
    !!state.metadataPath &&
    !!state.outputDir &&
    !!inspect &&
    !state.exporting;

  const summary = inspect
    ? `${FORMAT_LABEL[inspect.detectedFormat] || inspect.detectedFormat} · ${inspect.frames.length} 个子图`
    : state.inspecting
      ? "解析中..."
      : "选择图集与元数据";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图集拆分</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">图集图片</span>
              <button class="path-button" onClick={() => void handlePickAtlas()}>
                {basename(state.atlasPath) || "选择 atlas.png..."}
              </button>
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">元数据文件</span>
              <button class="path-button" onClick={() => void handlePickMetadata()}>
                {basename(state.metadataPath) || "选择 atlas.json / .plist / .css..."}
              </button>
            </div>
          </div>
        </section>

        {inspect && inspect.frames.length > 0 && (
          <section class="atlas-stage-left unpack-frame-list">
            <div class="atlas-input-list">
              {inspect.frames.map((f) => (
                <div key={f.name} class="atlas-input-row" title={f.name}>
                  <span class="atlas-input-name">
                    {f.name}
                    <span class="unpack-frame-meta">
                      {f.width}×{f.height}
                      {f.rotated ? " · 旋转" : ""}
                      {f.trimmed ? " · trim" : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section class="action-bar">
          <div class="action-entry">
            <button class="action-button action-primary" onClick={() => void handlePickAtlas()}>
              选择图集
            </button>
            <button class="action-button action-secondary" onClick={() => void handlePickMetadata()}>
              选择元数据
            </button>
          </div>
          <div class="action-meta">
            <span>{inspect ? `${inspect.frames.length} 个子图` : "等待解析"}</span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!state.atlasPath && !state.metadataPath}
              onClick={clearSession}
            >
              清空
            </button>
            <button
              class="ghost-button"
              disabled={!canExport}
              onClick={() => void exportUnpack()}
            >
              {state.exporting ? "拆分中..." : "拆分导出"}
            </button>
          </div>
        </section>

        <section class="advanced-panel">
          <div class="option-block">
            <span class="option-label">还原方式</span>
            <div class="option-list">
              <label class="radio-chip">
                <input
                  type="checkbox"
                  checked={state.restoreOriginalSize}
                  onChange={(e) =>
                    patch({
                      restoreOriginalSize: (e.currentTarget as HTMLInputElement).checked,
                    })
                  }
                />
                <span>恢复 trim 前的原图尺寸（透明填充）</span>
              </label>
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

        {state.lastExport && (
          <section class="summary-banner">
            <strong>拆分完成</strong>
            <span>
              已输出 {state.lastExport.outputPaths.length} 个子图
              {state.lastExport.skipped.length > 0
                ? ` · ${state.lastExport.skipped.length} 个跳过`
                : ""}
            </span>
            <span class="summary-spacer" />
            <button
              class="ghost-button"
              onClick={() => {
                const first = state.lastExport?.outputPaths[0];
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
