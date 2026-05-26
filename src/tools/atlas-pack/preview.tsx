import { useEffect, useRef, useState } from "preact/hooks";
import type { AtlasPackResult, AtlasPage } from "../../shared/types";

type Props = {
  result: AtlasPackResult | null;
};

// 把本地文件路径编码成 file:// URL，避免空格/中文导致 Image.src 失败
function pathToFileUrl(p: string): string {
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
}

async function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load ${path} failed`));
    img.src = pathToFileUrl(path);
  });
}

async function drawPage(
  canvas: HTMLCanvasElement,
  page: AtlasPage,
  containerWidth: number,
  containerHeight: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 计算 fit 缩放
  const scale = Math.min(
    containerWidth / page.width,
    containerHeight / page.height,
    1,
  );
  const dw = Math.max(1, Math.floor(page.width * scale));
  const dh = Math.max(1, Math.floor(page.height * scale));
  canvas.width = dw;
  canvas.height = dh;
  canvas.style.width = `${dw}px`;
  canvas.style.height = `${dh}px`;

  // 棋盘格底（标识透明区）
  const cell = 8;
  ctx.fillStyle = "#f5f5f7";
  ctx.fillRect(0, 0, dw, dh);
  ctx.fillStyle = "#e3e3e6";
  for (let y = 0; y < dh; y += cell) {
    for (let x = ((y / cell) % 2) * cell; x < dw; x += cell * 2) {
      ctx.fillRect(x, y, cell, cell);
    }
  }

  // 加载并绘制每个 frame
  for (const frame of page.frames) {
    const dx = frame.x * scale;
    const dy = frame.y * scale;
    const dwf = frame.width * scale;
    const dhf = frame.height * scale;
    let loadFailed = false;

    try {
      const img = await loadImage(frame.sourcePath);

      ctx.save();
      ctx.translate(dx, dy);

      if (frame.rotated) {
        // 旋转 90° 顺时针：先把坐标原点平移到右上角，再旋转
        ctx.translate(dwf, 0);
        ctx.rotate(Math.PI / 2);
      }

      // 源图裁剪区：trim 后内容在原图中位于 (trimX, trimY)，大小 (内容宽, 内容高)
      const contentW = frame.rotated ? frame.height : frame.width;
      const contentH = frame.rotated ? frame.width : frame.height;
      const drawW = frame.rotated ? dhf : dwf;
      const drawH = frame.rotated ? dwf : dhf;

      ctx.drawImage(
        img,
        frame.trimX,
        frame.trimY,
        contentW,
        contentH,
        0,
        0,
        drawW,
        drawH,
      );
      ctx.restore();
    } catch (e) {
      loadFailed = true;
      console.error("[atlas-preview] load failed:", frame.sourcePath, e);
    }

    // 描边：成功画红框；失败画黄框+斜线，让用户能看到加载失败的位置
    if (loadFailed) {
      ctx.strokeStyle = "rgba(255, 149, 0, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, dwf - 1, dhf - 1);
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx + dwf, dy + dhf);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255, 59, 48, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, dwf - 1, dhf - 1);
    }
  }
}

export function AtlasPreview({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageIdx, setPageIdx] = useState(0);

  // result 变化时重置选中页
  useEffect(() => {
    if (!result || pageIdx >= result.pages.length) {
      setPageIdx(0);
    }
  }, [result]);

  // 绘制
  useEffect(() => {
    if (!result || result.pages.length === 0) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const page = result.pages[pageIdx];
    if (!page) return;
    const { clientWidth, clientHeight } = container;
    void drawPage(canvas, page, clientWidth - 16, clientHeight - 48);
  }, [result, pageIdx]);

  if (!result || result.pages.length === 0) {
    return (
      <div class="atlas-preview empty" ref={containerRef}>
        <div class="empty-state">
          <div class="empty-state-illustration" aria-hidden="true" />
          <strong>等待图集预览</strong>
          <span>
            从左边拖入小图或点"添加小图"，
            打包结果会自动算出来画在这里
          </span>
        </div>
      </div>
    );
  }

  const page = result.pages[pageIdx];

  return (
    <div class="atlas-preview" ref={containerRef}>
      {result.pages.length > 1 && (
        <div class="atlas-page-tabs">
          {result.pages.map((_p, idx) => (
            <button
              key={idx}
              class={`atlas-page-tab ${idx === pageIdx ? "is-active" : ""}`}
              onClick={() => setPageIdx(idx)}
            >
              页 {idx + 1}
            </button>
          ))}
        </div>
      )}
      <div class="atlas-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
      {page && (
        <div class="atlas-page-meta">
          {page.width} × {page.height} · {page.frames.length} 子图 ·{" "}
          {(page.utilization * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
