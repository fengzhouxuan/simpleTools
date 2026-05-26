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
    try {
      const img = await loadImage(frame.sourcePath);
      const dx = frame.x * scale;
      const dy = frame.y * scale;
      const dwf = frame.width * scale;
      const dhf = frame.height * scale;

      // 注意：frame.x/y/w/h 是在 atlas 中的占位，trim/rotate 后的内容尺寸
      // 不 trim：直接画原图缩放到 dw/dh
      // trim：画原图，但只保留 trim 后的区域，需要 sx/sy/sw/sh
      // rotate：先 translate + rotate
      ctx.save();
      ctx.translate(dx, dy);

      if (frame.rotated) {
        // 主进程约定旋转 90° 顺时针：画图前转 90°，画完归位
        // 旋转后内容尺寸是 (frame.height, frame.width)
        // 画到原始坐标后，把内容画到 (0, -frame.width) 位置 + 90° 旋转
        ctx.translate(dwf, 0);
        ctx.rotate(Math.PI / 2);
      }

      // 计算源裁剪区
      // 内容在原图中位于 (trimX, trimY) 起点，大小 (内容宽, 内容高)
      // rotate 时内容宽=frame.height, 内容高=frame.width
      const contentW = frame.rotated ? frame.height : frame.width;
      const contentH = frame.rotated ? frame.width : frame.height;
      const sw = contentW;
      const sh = contentH;
      // 绘制目标尺寸（rotate 后画到逻辑 sw,sh 区域，因为已经旋转过坐标系）
      const drawW = frame.rotated ? dhf : dwf;
      const drawH = frame.rotated ? dwf : dhf;

      ctx.drawImage(
        img,
        frame.trimX,
        frame.trimY,
        sw,
        sh,
        0,
        0,
        drawW,
        drawH,
      );
      ctx.restore();

      // 红色描边
      ctx.strokeStyle = "rgba(255, 59, 48, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, dwf - 1, dhf - 1);
    } catch (e) {
      // 单张失败不阻塞整张图
      console.error("[atlas-preview] draw failed:", e);
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
        <span>导入小图后即可看到打包预览</span>
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
