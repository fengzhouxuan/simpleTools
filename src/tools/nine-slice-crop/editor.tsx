import { useEffect, useRef, useState } from "preact/hooks";
import type { NineSliceInsets } from "../../shared/types";

type Props = {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  insets: NineSliceInsets;
  onChange: (next: Partial<NineSliceInsets>) => void;
};

// 把本地路径编码成 file:// URL（同 atlas-preview 的 helper）
function pathToFileUrl(p: string): string {
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
}

type Edge = "l" | "t" | "r" | "b";

// 把客户端 px 转换成 SVG userspace 坐标
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function NineSliceEditor({
  imagePath,
  imageWidth: W,
  imageHeight: H,
  insets,
  onChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<Edge | null>(null);
  const [focused, setFocused] = useState<Edge | null>(null);

  // 辅助线当前位置（用原图像素坐标，跟 inset 一对一映射）
  // L 线在 x = l；R 线在 x = W - r
  // T 线在 y = t；B 线在 y = H - b
  const xL = insets.l;
  const xR = W - insets.r;
  const yT = insets.t;
  const yB = H - insets.b;

  // 拖拽处理
  useEffect(() => {
    if (!dragging) return;
    const svg = svgRef.current;
    if (!svg) return;

    const onMove = (e: PointerEvent) => {
      const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
      switch (dragging) {
        case "l":
          // 不允许跨过 R 线，也不能超出原图
          onChange({ l: Math.round(clamp(x, 0, W - insets.r - 1)) });
          break;
        case "r":
          onChange({ r: Math.round(clamp(W - x, 0, W - insets.l - 1)) });
          break;
        case "t":
          onChange({ t: Math.round(clamp(y, 0, H - insets.b - 1)) });
          break;
        case "b":
          onChange({ b: Math.round(clamp(H - y, 0, H - insets.t - 1)) });
          break;
      }
    };
    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, W, H, insets.l, insets.t, insets.r, insets.b, onChange]);

  // 键盘微调：方向键 1px，Shift+方向键 10px
  const onKeyDown = (e: KeyboardEvent) => {
    if (!focused) return;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    switch (focused) {
      case "l":
        if (e.key === "ArrowLeft")
          onChange({ l: Math.max(0, insets.l - step) });
        else if (e.key === "ArrowRight")
          onChange({ l: Math.min(W - insets.r - 1, insets.l + step) });
        else handled = false;
        break;
      case "r":
        if (e.key === "ArrowLeft")
          onChange({ r: Math.min(W - insets.l - 1, insets.r + step) });
        else if (e.key === "ArrowRight")
          onChange({ r: Math.max(0, insets.r - step) });
        else handled = false;
        break;
      case "t":
        if (e.key === "ArrowUp")
          onChange({ t: Math.max(0, insets.t - step) });
        else if (e.key === "ArrowDown")
          onChange({ t: Math.min(H - insets.b - 1, insets.t + step) });
        else handled = false;
        break;
      case "b":
        if (e.key === "ArrowUp")
          onChange({ b: Math.min(H - insets.t - 1, insets.b + step) });
        else if (e.key === "ArrowDown")
          onChange({ b: Math.max(0, insets.b - step) });
        else handled = false;
        break;
    }
    if (handled) e.preventDefault();
  };

  // 4 个角的"安全区"半透明高亮（不变形）
  const corners = [
    { x: 0, y: 0, w: insets.l, h: insets.t, key: "tl" },
    { x: xR, y: 0, w: insets.r, h: insets.t, key: "tr" },
    { x: 0, y: yB, w: insets.l, h: insets.b, key: "bl" },
    { x: xR, y: yB, w: insets.r, h: insets.b, key: "br" },
  ].filter((c) => c.w > 0 && c.h > 0);

  // 中心 = 可被压成 1px 的"冗余区"
  const centerW = W - insets.l - insets.r;
  const centerH = H - insets.t - insets.b;
  const showCenter = centerW > 0 && centerH > 0;

  // 边带（中心方向单维度可压缩）
  const tBand = insets.t > 0 && centerW > 0
    ? { x: insets.l, y: 0, w: centerW, h: insets.t }
    : null;
  const bBand = insets.b > 0 && centerW > 0
    ? { x: insets.l, y: yB, w: centerW, h: insets.b }
    : null;
  const lBand = insets.l > 0 && centerH > 0
    ? { x: 0, y: insets.t, w: insets.l, h: centerH }
    : null;
  const rBand = insets.r > 0 && centerH > 0
    ? { x: xR, y: insets.t, w: insets.r, h: centerH }
    : null;

  // hit area 用 viewport 坐标算："离辅助线 ±6px"的区域可触发拖拽
  // 由于 SVG 缩放比例不固定，要换算回原图像素 — 用 hitHalf 估算
  // 这里简化：直接用一个固定的"几何半宽"，靠 CSS pointer-events 让 hit 区域大一点
  const HIT_HALF = Math.max(2, Math.min(W, H) * 0.01);

  return (
    <svg
      ref={svgRef}
      class="nine-slice-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {/* 底图 */}
      <image
        href={pathToFileUrl(imagePath)}
        x="0"
        y="0"
        width={W}
        height={H}
        preserveAspectRatio="none"
      />

      {/* 4 个安全区（绿色透明覆盖，提示"不变形"）*/}
      {corners.map((c) => (
        <rect
          key={c.key}
          class="nine-slice-corner"
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
        />
      ))}

      {/* 4 个边带（橙色透明覆盖，提示"单方向可压缩"）*/}
      {tBand && <rect class="nine-slice-band" {...rectAttrs(tBand)} />}
      {bBand && <rect class="nine-slice-band" {...rectAttrs(bBand)} />}
      {lBand && <rect class="nine-slice-band" {...rectAttrs(lBand)} />}
      {rBand && <rect class="nine-slice-band" {...rectAttrs(rBand)} />}

      {/* 中心冗余区（红色透明覆盖，提示"会被压缩到 1px"）*/}
      {showCenter && (
        <rect
          class="nine-slice-center"
          x={insets.l}
          y={insets.t}
          width={centerW}
          height={centerH}
        />
      )}

      {/* 4 条辅助线 */}
      <Guide
        kind="v"
        coord={xL}
        length={H}
        active={dragging === "l" || focused === "l"}
        hitHalf={HIT_HALF}
        onPointerDown={() => {
          setDragging("l");
          setFocused("l");
        }}
        onFocus={() => setFocused("l")}
        visible={insets.l > 0}
      />
      <Guide
        kind="v"
        coord={xR}
        length={H}
        active={dragging === "r" || focused === "r"}
        hitHalf={HIT_HALF}
        onPointerDown={() => {
          setDragging("r");
          setFocused("r");
        }}
        onFocus={() => setFocused("r")}
        visible={insets.r > 0}
      />
      <Guide
        kind="h"
        coord={yT}
        length={W}
        active={dragging === "t" || focused === "t"}
        hitHalf={HIT_HALF}
        onPointerDown={() => {
          setDragging("t");
          setFocused("t");
        }}
        onFocus={() => setFocused("t")}
        visible={insets.t > 0}
      />
      <Guide
        kind="h"
        coord={yB}
        length={W}
        active={dragging === "b" || focused === "b"}
        hitHalf={HIT_HALF}
        onPointerDown={() => {
          setDragging("b");
          setFocused("b");
        }}
        onFocus={() => setFocused("b")}
        visible={insets.b > 0}
      />
    </svg>
  );
}

function rectAttrs(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

type GuideProps = {
  kind: "v" | "h";
  coord: number;
  length: number;
  hitHalf: number;
  active: boolean;
  visible: boolean;
  onPointerDown: () => void;
  onFocus: () => void;
};

function Guide({
  kind,
  coord,
  length,
  hitHalf,
  active,
  visible,
  onPointerDown,
  onFocus,
}: GuideProps) {
  const handler = (e: { preventDefault?: () => void }) => {
    if (e.preventDefault) e.preventDefault();
    onPointerDown();
  };

  if (kind === "v") {
    return (
      <g class={`nine-slice-guide ${active ? "is-active" : ""}`}>
        {/* 主辅助线，只在 inset > 0 时显示 */}
        {visible && (
          <line x1={coord} x2={coord} y1={0} y2={length} class="guide-line" />
        )}
        {/* hit area，永远存在，让用户能从图边缘拖出来 */}
        <rect
          x={coord - hitHalf}
          y={0}
          width={hitHalf * 2}
          height={length}
          class="guide-hit"
          onPointerDown={handler as any}
          onFocus={onFocus}
          tabIndex={0}
        />
      </g>
    );
  }
  return (
    <g class={`nine-slice-guide ${active ? "is-active" : ""}`}>
      {visible && (
        <line x1={0} x2={length} y1={coord} y2={coord} class="guide-line" />
      )}
      <rect
        x={0}
        y={coord - hitHalf}
        width={length}
        height={hitHalf * 2}
        class="guide-hit"
        onPointerDown={handler as any}
        onFocus={onFocus}
        tabIndex={0}
      />
    </g>
  );
}
