import { describe, it, expect } from "vitest";
import nineSliceCrop from "./nine-slice-crop.cjs";

const {
  validateInsets,
  computeCropSegments,
  computeRestoreSegments,
  computeOutputSize,
  computeSavedRatio,
} = nineSliceCrop.__test__;

const CK = { x: 1, y: 1 };

// ============================================================
// computeOutputSize — 关键 bug 区域
// ============================================================
// 旧算法 (L+ckx+R)×(T+cky+B) 在 3-slice 时会把不切的维度压成 1px → 错
// 正确：只在"用户切了的方向"压缩，不切的方向保留原尺寸

describe("computeOutputSize", () => {
  const ORIG = { w: 750, h: 956 };

  it("9-slice 标准：4 个 inset 都 > 0", () => {
    expect(
      computeOutputSize(ORIG, { l: 12, t: 20, r: 12, b: 28 }, CK),
    ).toEqual({ w: 25, h: 49 });
  });

  it("横向 3-slice (L=R>0, T=B=0)：高度保留原图", () => {
    expect(
      computeOutputSize(ORIG, { l: 12, t: 0, r: 12, b: 0 }, CK),
    ).toEqual({ w: 25, h: 956 });
  });

  it("竖向 3-slice (T=B>0, L=R=0)：宽度保留原图", () => {
    expect(
      computeOutputSize(ORIG, { l: 0, t: 340, r: 0, b: 76 }, CK),
    ).toEqual({ w: 750, h: 417 });
  });

  it("退化 (全 0)：不压，输出 = 原图", () => {
    expect(computeOutputSize(ORIG, { l: 0, t: 0, r: 0, b: 0 }, CK)).toEqual({
      w: 750,
      h: 956,
    });
  });

  it("L-slice (只一边 > 0)：另一维仍压 ckx，但不切方向保留原图", () => {
    expect(
      computeOutputSize(ORIG, { l: 30, t: 0, r: 0, b: 0 }, CK),
    ).toEqual({ w: 31, h: 956 });
  });

  it("center_keep > 1：种子尺寸跟随增加", () => {
    expect(
      computeOutputSize(ORIG, { l: 12, t: 20, r: 12, b: 28 }, { x: 2, y: 4 }),
    ).toEqual({ w: 26, h: 52 });
  });
});

describe("computeSavedRatio", () => {
  it("典型 9-slice：400×200 → 25×49，省 ~98.5%", () => {
    const ratio = computeSavedRatio({ w: 400, h: 200 }, { w: 25, h: 49 });
    expect(ratio).toBeGreaterThan(0.984);
    expect(ratio).toBeLessThan(0.986);
  });

  it("竖向 3-slice：750×956 → 750×417，省 ~56%（水平方向不压）", () => {
    const ratio = computeSavedRatio({ w: 750, h: 956 }, { w: 750, h: 417 });
    expect(ratio).toBeGreaterThan(0.56);
    expect(ratio).toBeLessThan(0.57);
  });

  it("输出 = 原图：0%", () => {
    expect(computeSavedRatio({ w: 100, h: 100 }, { w: 100, h: 100 })).toBe(0);
  });

  it("输出 > 原图：clamp 到 0", () => {
    expect(computeSavedRatio({ w: 50, h: 50 }, { w: 100, h: 100 })).toBe(0);
  });

  it("原图为 0：返回 0（不爆 NaN）", () => {
    expect(computeSavedRatio({ w: 0, h: 0 }, { w: 1, h: 1 })).toBe(0);
  });
});

// ============================================================
// validateInsets — 边界值
// ============================================================

describe("validateInsets", () => {
  it("正常 9-slice 通过", () => {
    expect(() =>
      validateInsets(400, 200, { l: 12, t: 20, r: 12, b: 28 }, CK),
    ).not.toThrow();
  });

  it("3-slice 横向 (T=B=0) 通过", () => {
    expect(() =>
      validateInsets(400, 200, { l: 12, t: 0, r: 12, b: 0 }, CK),
    ).not.toThrow();
  });

  it("3-slice 竖向 (L=R=0) 通过", () => {
    expect(() =>
      validateInsets(400, 200, { l: 0, t: 20, r: 0, b: 28 }, CK),
    ).not.toThrow();
  });

  it("全 0 通过（退化但合法）", () => {
    expect(() =>
      validateInsets(400, 200, { l: 0, t: 0, r: 0, b: 0 }, CK),
    ).not.toThrow();
  });

  it("负数抛错", () => {
    expect(() =>
      validateInsets(400, 200, { l: -1, t: 0, r: 0, b: 0 }, CK),
    ).toThrow(/inset 不能为负/);
  });

  it("centerKeep < 1 抛错", () => {
    expect(() =>
      validateInsets(400, 200, { l: 0, t: 0, r: 0, b: 0 }, { x: 0, y: 1 }),
    ).toThrow(/至少为 1px/);
  });

  it("L+R >= W 抛错", () => {
    expect(() =>
      validateInsets(100, 200, { l: 50, t: 0, r: 50, b: 0 }, CK),
    ).toThrow(/必须 < 原图宽/);
  });

  it("T+B >= H 抛错", () => {
    expect(() =>
      validateInsets(400, 100, { l: 0, t: 60, r: 0, b: 40 }, CK),
    ).toThrow(/必须 < 原图高/);
  });
});

// ============================================================
// computeCropSegments — 网格分段抽象的核心
// ============================================================

describe("computeCropSegments", () => {
  it("退化 (near=far=0)：整段保留", () => {
    const r = computeCropSegments(750, 0, 0, 1);
    expect(r.outSize).toBe(750);
    expect(r.segments).toEqual([
      { srcStart: 0, srcSize: 750, dstStart: 0, dstSize: 750 },
    ]);
  });

  it("9-slice 维度 (near>0, far>0)：3 段", () => {
    const r = computeCropSegments(400, 12, 12, 1);
    expect(r.outSize).toBe(25);
    expect(r.segments).toHaveLength(3);
    // 近段
    expect(r.segments[0]).toEqual({
      srcStart: 0,
      srcSize: 12,
      dstStart: 0,
      dstSize: 12,
    });
    // 中心代表种子：从几何中心取，midX = 12 + floor((400-12-12-1)/2) = 12 + 187 = 199
    expect(r.segments[1]).toEqual({
      srcStart: 199,
      srcSize: 1,
      dstStart: 12,
      dstSize: 1,
    });
    // 远段
    expect(r.segments[2]).toEqual({
      srcStart: 388,
      srcSize: 12,
      dstStart: 13,
      dstSize: 12,
    });
  });

  it("L-slice 维度 (near>0, far=0)：2 段", () => {
    const r = computeCropSegments(400, 30, 0, 1);
    expect(r.outSize).toBe(31);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toEqual({
      srcStart: 0,
      srcSize: 30,
      dstStart: 0,
      dstSize: 30,
    });
    // 中心代表：30 + floor((400-30-0-1)/2) = 30 + 184 = 214
    expect(r.segments[1]).toEqual({
      srcStart: 214,
      srcSize: 1,
      dstStart: 30,
      dstSize: 1,
    });
  });

  it("center_keep = 4：种子尺寸 4", () => {
    const r = computeCropSegments(400, 12, 12, 4);
    expect(r.outSize).toBe(28); // 12 + 4 + 12
    expect(r.segments[1].srcSize).toBe(4);
    expect(r.segments[1].dstSize).toBe(4);
  });
});

// ============================================================
// computeRestoreSegments — 还原分段
// ============================================================

describe("computeRestoreSegments", () => {
  it("退化：整段保留，源 == 目标", () => {
    const r = computeRestoreSegments(750, 0, 0, 1);
    expect(r).toEqual([
      { srcStart: 0, srcSize: 750, dstStart: 0, dstSize: 750 },
    ]);
  });

  it("9-slice 维度：中心段源 1px 拉到完整中心", () => {
    const r = computeRestoreSegments(400, 12, 12, 1);
    expect(r).toHaveLength(3);
    // 边段：源 == 目标（不拉伸）
    expect(r[0]).toEqual({
      srcStart: 0,
      srcSize: 12,
      dstStart: 0,
      dstSize: 12,
    });
    expect(r[2]).toEqual({
      srcStart: 388,
      srcSize: 12,
      dstStart: 388,
      dstSize: 12,
    });
    // 中心段：源 1px，目标 376px（拉 376 倍）
    expect(r[1]).toEqual({
      srcStart: 199,
      srcSize: 1,
      dstStart: 12,
      dstSize: 376,
    });
  });

  it("L-slice 维度：2 段，中心拉到整个 (size - near)", () => {
    const r = computeRestoreSegments(400, 30, 0, 1);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      srcStart: 0,
      srcSize: 30,
      dstStart: 0,
      dstSize: 30,
    });
    expect(r[1]).toEqual({
      srcStart: 214,
      srcSize: 1,
      dstStart: 30,
      dstSize: 370,
    });
  });
});
