import { describe, it, expect } from "vitest";
import compress from "./compress.cjs";

const {
  resolveRasterOutputExtension,
  replaceExtension,
  isRasterExtension,
  normalizeResizeOptions,
} = compress.__test__;

// ============================================================
// isRasterExtension：判断扩展名是否栅格图
// ============================================================

describe("isRasterExtension", () => {
  it("识别常见栅格格式", () => {
    expect(isRasterExtension(".jpg")).toBe(true);
    expect(isRasterExtension(".jpeg")).toBe(true);
    expect(isRasterExtension(".png")).toBe(true);
    expect(isRasterExtension(".gif")).toBe(true);
  });

  it("svg / webp 不算栅格（svg 矢量，webp 走单独分支）", () => {
    expect(isRasterExtension(".svg")).toBe(false);
    expect(isRasterExtension(".webp")).toBe(false);
    expect(isRasterExtension(".bmp")).toBe(false);
  });
});

// ============================================================
// resolveRasterOutputExtension：根据输入扩展名 + 目标格式定输出扩展名
// 关键约束：
//  - "original" 时保持原扩展名（jpeg 归一为 jpg）
//  - GIF 输入时无论 outputFormat 是啥都强制 .gif
//  - 其他 jpg/png/webp 按指定走
// ============================================================

describe("resolveRasterOutputExtension", () => {
  it("original：保持原扩展，jpeg 归一为 jpg", () => {
    expect(resolveRasterOutputExtension(".jpg", "original")).toBe(".jpg");
    expect(resolveRasterOutputExtension(".jpeg", "original")).toBe(".jpg");
    expect(resolveRasterOutputExtension(".png", "original")).toBe(".png");
    expect(resolveRasterOutputExtension(".gif", "original")).toBe(".gif");
  });

  it("GIF 输入强制保持 .gif，不管 outputFormat", () => {
    expect(resolveRasterOutputExtension(".gif", "jpg")).toBe(".gif");
    expect(resolveRasterOutputExtension(".gif", "png")).toBe(".gif");
    expect(resolveRasterOutputExtension(".gif", "webp")).toBe(".gif");
  });

  it("非 GIF 输入：跟随 outputFormat", () => {
    expect(resolveRasterOutputExtension(".png", "jpg")).toBe(".jpg");
    expect(resolveRasterOutputExtension(".jpg", "png")).toBe(".png");
    expect(resolveRasterOutputExtension(".png", "webp")).toBe(".webp");
    expect(resolveRasterOutputExtension(".jpeg", "webp")).toBe(".webp");
  });

  it("不识别的 outputFormat 抛错", () => {
    expect(() => resolveRasterOutputExtension(".png", "bmp")).toThrow();
  });
});

// ============================================================
// replaceExtension
// ============================================================

describe("replaceExtension", () => {
  it("替换扩展名", () => {
    expect(replaceExtension("hero.png", ".jpg")).toBe("hero.jpg");
    expect(replaceExtension("a.b.c.png", ".webp")).toBe("a.b.c.webp");
  });

  it("无扩展名时直接拼接", () => {
    expect(replaceExtension("noext", ".png")).toBe("noext.png");
  });
});

// ============================================================
// normalizeResizeOptions：把可能含 undefined / 字符串的 resize 参数收敛
// ============================================================

describe("normalizeResizeOptions", () => {
  it("空对象 → 全 undefined / 默认", () => {
    const r = normalizeResizeOptions({});
    expect(r.width).toBeUndefined();
    expect(r.height).toBeUndefined();
    expect(r.preserveAspect).toBe(true);
    expect(r.resizeMode).toBe("crop");
  });

  it("0 / 负数 / 字符串都归一为 undefined", () => {
    expect(normalizeResizeOptions({ width: 0 }).width).toBeUndefined();
    expect(normalizeResizeOptions({ width: -10 }).width).toBeUndefined();
    expect(normalizeResizeOptions({ width: "abc" }).width).toBeUndefined();
  });

  it("有效数字保留", () => {
    const r = normalizeResizeOptions({ width: 1920, height: 1080 });
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });

  it("preserveAspect 默认 true，显式 false 才覆盖", () => {
    expect(normalizeResizeOptions({}).preserveAspect).toBe(true);
    expect(normalizeResizeOptions({ preserveAspect: false }).preserveAspect).toBe(
      false,
    );
    expect(normalizeResizeOptions({ preserveAspect: true }).preserveAspect).toBe(
      true,
    );
  });

  it("resizeMode 只接受 stretch / crop，其它归一为 crop", () => {
    expect(normalizeResizeOptions({ resizeMode: "stretch" }).resizeMode).toBe(
      "stretch",
    );
    expect(normalizeResizeOptions({ resizeMode: "crop" }).resizeMode).toBe(
      "crop",
    );
    expect(normalizeResizeOptions({ resizeMode: "invalid" }).resizeMode).toBe(
      "crop",
    );
  });
});
