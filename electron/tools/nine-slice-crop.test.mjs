import { describe, it, expect } from "vitest";
import nineSliceCrop from "./nine-slice-crop.cjs";

const { validateInsets, computeOutputSize, computeSavedRatio, bandSourceRects } =
  nineSliceCrop.__test__;

const CK = { x: 1, y: 1 };

describe("computeOutputSize", () => {
  it("9-slice 标准：4 个 inset 都 > 0", () => {
    expect(computeOutputSize({ l: 12, t: 20, r: 12, b: 28 }, { x: 1, y: 1 })).toEqual({
      w: 25, // 12 + 1 + 12
      h: 49, // 20 + 1 + 28
    });
  });

  it("3-slice 横向：L/R > 0, T=B=0", () => {
    expect(computeOutputSize({ l: 12, t: 0, r: 12, b: 0 }, { x: 1, y: 1 })).toEqual({
      w: 25,
      h: 1,
    });
  });

  it("3-slice 竖向：T/B > 0, L=R=0", () => {
    expect(computeOutputSize({ l: 0, t: 8, r: 0, b: 12 }, { x: 1, y: 1 })).toEqual({
      w: 1,
      h: 21,
    });
  });

  it("center_keep > 1：尺寸按比例增加", () => {
    expect(computeOutputSize({ l: 12, t: 20, r: 12, b: 28 }, { x: 2, y: 4 })).toEqual({
      w: 26, // 12 + 2 + 12
      h: 52, // 20 + 4 + 28
    });
  });

  it("全 0 退化：仅剩中心 keep", () => {
    expect(computeOutputSize({ l: 0, t: 0, r: 0, b: 0 }, { x: 1, y: 1 })).toEqual({
      w: 1,
      h: 1,
    });
  });
});

describe("computeSavedRatio", () => {
  it("典型例子：400×200 → 25×49，省 ~98.5%", () => {
    const ratio = computeSavedRatio({ w: 400, h: 200 }, { w: 25, h: 49 });
    expect(ratio).toBeGreaterThan(0.984);
    expect(ratio).toBeLessThan(0.986);
  });

  it("输出 = 原图：0%", () => {
    expect(computeSavedRatio({ w: 100, h: 100 }, { w: 100, h: 100 })).toBe(0);
  });

  it("输出 > 原图：clamp 到 0（不会出现负数）", () => {
    expect(computeSavedRatio({ w: 50, h: 50 }, { w: 100, h: 100 })).toBe(0);
  });

  it("原图为 0：返回 0（不爆 NaN）", () => {
    expect(computeSavedRatio({ w: 0, h: 0 }, { w: 1, h: 1 })).toBe(0);
  });
});

describe("validateInsets", () => {
  it("正常 inset 通过", () => {
    expect(() =>
      validateInsets(400, 200, { l: 12, t: 20, r: 12, b: 28 }, CK),
    ).not.toThrow();
  });

  it("负数 inset 抛错", () => {
    expect(() =>
      validateInsets(400, 200, { l: -1, t: 0, r: 0, b: 0 }, CK),
    ).toThrow(/inset 不能为负/);
  });

  it("centerKeep < 1 抛错", () => {
    expect(() =>
      validateInsets(400, 200, { l: 0, t: 0, r: 0, b: 0 }, { x: 0, y: 1 }),
    ).toThrow(/至少为 1px/);
  });

  it("L + R >= W 抛错（边界 = 原宽）", () => {
    expect(() =>
      validateInsets(100, 200, { l: 50, t: 0, r: 50, b: 0 }, CK),
    ).toThrow(/必须 < 原图宽/);
  });

  it("T + B >= H 抛错", () => {
    expect(() =>
      validateInsets(400, 100, { l: 0, t: 60, r: 0, b: 40 }, CK),
    ).toThrow(/必须 < 原图高/);
  });

  it("L + R = W - 1（最贴近边界的合法值）通过", () => {
    expect(() =>
      validateInsets(100, 100, { l: 49, t: 0, r: 50, b: 0 }, CK),
    ).not.toThrow();
  });
});

describe("bandSourceRects", () => {
  // 用一个干净的例子：400×200，L=12 T=20 R=12 B=28，center=1×1
  const W = 400;
  const H = 200;
  const insets = { l: 12, t: 20, r: 12, b: 28 };

  it("4 角的尺寸正确", () => {
    const rects = bandSourceRects(W, H, insets, CK);
    expect(rects.tl).toEqual({ left: 0, top: 0, width: 12, height: 20 });
    expect(rects.tr).toEqual({ left: 388, top: 0, width: 12, height: 20 });
    expect(rects.bl).toEqual({ left: 0, top: 172, width: 12, height: 28 });
    expect(rects.br).toEqual({ left: 388, top: 172, width: 12, height: 28 });
  });

  it("centerW / centerH 正确", () => {
    const rects = bandSourceRects(W, H, insets, CK);
    expect(rects.centerW).toBe(376); // 400 - 12 - 12
    expect(rects.centerH).toBe(152); // 200 - 20 - 28
  });

  it("中心 patch 位于几何中心", () => {
    const rects = bandSourceRects(W, H, insets, CK);
    // midX = 12 + floor((376 - 1) / 2) = 12 + 187 = 199
    // midY = 20 + floor((152 - 1) / 2) = 20 + 75 = 95
    expect(rects.centerPatch).toEqual({
      left: 199,
      top: 95,
      width: 1,
      height: 1,
    });
  });

  it("上下边带从中心列开始取 ckx 宽", () => {
    const rects = bandSourceRects(W, H, insets, CK);
    expect(rects.topBand).toEqual({ left: 199, top: 0, width: 1, height: 20 });
    expect(rects.bottomBand).toEqual({
      left: 199,
      top: 172,
      width: 1,
      height: 28,
    });
  });

  it("左右边带从中心行开始取 cky 高", () => {
    const rects = bandSourceRects(W, H, insets, CK);
    expect(rects.leftBand).toEqual({ left: 0, top: 95, width: 12, height: 1 });
    expect(rects.rightBand).toEqual({
      left: 388,
      top: 95,
      width: 12,
      height: 1,
    });
  });

  it("3-slice 横向（T=B=0）的 centerH = H，左右边带高 = cky", () => {
    const rects = bandSourceRects(200, 40, { l: 12, t: 0, r: 12, b: 0 }, CK);
    expect(rects.centerH).toBe(40);
    expect(rects.leftBand).toEqual({ left: 0, top: 19, width: 12, height: 1 });
    expect(rects.rightBand).toEqual({
      left: 188,
      top: 19,
      width: 12,
      height: 1,
    });
  });

  it("中心 keep 2×4 时 patch 尺寸正确且仍居中", () => {
    const rects = bandSourceRects(W, H, insets, { x: 2, y: 4 });
    // midX = 12 + floor((376 - 2) / 2) = 12 + 187 = 199
    // midY = 20 + floor((152 - 4) / 2) = 20 + 74 = 94
    expect(rects.centerPatch).toEqual({
      left: 199,
      top: 94,
      width: 2,
      height: 4,
    });
  });
});
