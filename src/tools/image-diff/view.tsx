import { Spinner } from "../../components/spinner";
import { useImageDiff } from "./state";

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

// 把本地路径转成 file:// URL 给 <img src> 用
function pathToFileUrl(p: string): string {
  if (!p) return "";
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
}

export function ImageDiffView() {
  const { state, patch, clearSession } = useImageDiff();
  const { result } = state;

  const handlePickA = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ]);
    if (picked) patch({ aPath: picked });
  };
  const handlePickB = async () => {
    const picked = await window.simpleImage.core.fs.pickSingleFile([
      { name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ]);
    if (picked) patch({ bPath: picked });
  };

  const ready = !!state.aPath && !!state.bPath;
  const stats = result?.stats;

  const summary = stats
    ? `差异 ${stats.diffPixels} px / ${stats.totalPixels} px · ${(stats.diffRatio * 100).toFixed(2)}%`
    : state.running
      ? "对比中..."
      : "选择两张图开始对比";

  return (
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图片对比</strong>
        <span>{summary}</span>
      </div>

      <div class="tuya-content">
        {/* 两张图选择 */}
        <section class="settings-grid">
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">图 A</span>
              <button
                class={`path-button ${state.aPath ? "" : "is-empty"}`}
                onClick={() => void handlePickA()}
              >
                {basename(state.aPath) || "选择第一张图..."}
              </button>
              {stats && (
                <span class="param-hint">
                  原图尺寸 {stats.aSize.w} × {stats.aSize.h}
                </span>
              )}
            </div>
          </div>
          <div class="settings-card">
            <div class="option-block">
              <span class="option-label">图 B</span>
              <button
                class={`path-button ${state.bPath ? "" : "is-empty"}`}
                onClick={() => void handlePickB()}
              >
                {basename(state.bPath) || "选择第二张图..."}
              </button>
              {stats && (
                <span class="param-hint">
                  原图尺寸 {stats.bSize.w} × {stats.bSize.h}
                  {!stats.sizesMatch && (
                    <span style={{ color: "var(--accent)" }}>
                      {" "}· 尺寸不一致，已 contain 缩放到 {stats.comparedWidth}×{stats.comparedHeight} 比对
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 阈值 + 操作 */}
        <section class="action-bar">
          <div class="action-entry">
            <label class="mini-field" style={{ minWidth: "180px" }}>
              <span>差异阈值（0~255）</span>
              <input
                type="number"
                min="0"
                max="255"
                value={state.threshold}
                onInput={(e) =>
                  patch({
                    threshold: Math.max(
                      0,
                      Math.min(
                        255,
                        Number((e.currentTarget as HTMLInputElement).value) || 0,
                      ),
                    ),
                  })
                }
              />
            </label>
          </div>
          <div class="action-meta">
            <span>
              {state.threshold === 0
                ? "严格比对：任何像素差异都算"
                : `允许单通道 ≤ ${state.threshold} 的差异（消除 JPEG 噪声）`}
            </span>
          </div>
          <div class="action-group">
            <button
              class="ghost-button"
              disabled={!state.aPath && !state.bPath}
              onClick={clearSession}
            >
              清空
            </button>
          </div>
        </section>

        {/* 主区：三列展示 A / B / Diff */}
        {ready ? (
          <section class="diff-triplet">
            <div class="diff-cell">
              <div class="diff-cell-label">A</div>
              <div class="diff-cell-canvas">
                <img src={pathToFileUrl(state.aPath)} alt="A" />
              </div>
            </div>
            <div class="diff-cell">
              <div class="diff-cell-label">B</div>
              <div class="diff-cell-canvas">
                <img src={pathToFileUrl(state.bPath)} alt="B" />
              </div>
            </div>
            <div class="diff-cell">
              <div class="diff-cell-label">
                Diff
                {state.running && <Spinner inline={false} />}
              </div>
              <div class="diff-cell-canvas diff-cell-canvas-diff">
                {result ? (
                  <img src={result.diffImageDataUri} alt="Diff" />
                ) : (
                  <div class="empty-state" style={{ padding: "20px" }}>
                    <span>计算中</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section class="empty-card">
            <div class="empty-state">
              <div class="empty-state-illustration" aria-hidden="true" />
              <strong>选两张图开始对比</strong>
              <span>
                支持 PNG / JPG / WebP / GIF。两张图尺寸不同时会自动用 contain 缩放到统一尺寸再像素比对
              </span>
            </div>
          </section>
        )}

        {/* 数值统计 */}
        {stats && (
          <section class="diff-stats">
            <div class={`diff-chip ${stats.diffPixels === 0 ? "diff-unchanged" : "diff-modified"}`}>
              <strong>{stats.diffPixels.toLocaleString()}</strong>
              <span>不同像素</span>
            </div>
            <div class="diff-chip diff-unchanged">
              <strong>{(stats.diffRatio * 100).toFixed(2)}%</strong>
              <span>占比</span>
            </div>
            <div class="diff-chip diff-unchanged">
              <strong>{stats.maxDelta}</strong>
              <span>最大差（0~255）</span>
            </div>
            <div class="diff-chip diff-unchanged">
              <strong>{stats.avgDelta.toFixed(2)}</strong>
              <span>平均差</span>
            </div>
          </section>
        )}

        {state.lastError && (
          <section class="compat-warning" role="alert">
            <span class="compat-icon" aria-hidden="true">⚠</span>
            <span class="compat-text">{state.lastError}</span>
          </section>
        )}
      </div>
    </section>
  );
}
