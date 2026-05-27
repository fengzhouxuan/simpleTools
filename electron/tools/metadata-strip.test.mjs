import { describe, it, expect } from "vitest";
import metadataStrip from "./metadata-strip.cjs";

const { buildMetadataOptions, SUPPORTED_EXT } = metadataStrip.__test__;

describe("SUPPORTED_EXT", () => {
  it("覆盖 sharp 能读写的 5 种格式", () => {
    expect(SUPPORTED_EXT.has(".jpg")).toBe(true);
    expect(SUPPORTED_EXT.has(".jpeg")).toBe(true);
    expect(SUPPORTED_EXT.has(".png")).toBe(true);
    expect(SUPPORTED_EXT.has(".webp")).toBe(true);
    expect(SUPPORTED_EXT.has(".gif")).toBe(true);
  });

  it("不支持 sharp 写不了的格式", () => {
    expect(SUPPORTED_EXT.has(".svg")).toBe(false);
    expect(SUPPORTED_EXT.has(".bmp")).toBe(false);
    expect(SUPPORTED_EXT.has(".tiff")).toBe(false);
    expect(SUPPORTED_EXT.has(".heic")).toBe(false);
  });
});

describe("buildMetadataOptions", () => {
  it("两个开关都关 → 返回空对象（默认 strip 一切）", () => {
    const opts = buildMetadataOptions(
      { orientation: 6 },
      { preserveColorProfile: false, preserveOrientation: false },
    );
    expect(opts).toEqual({});
  });

  it("只开 orientation 且原图有 → 写入 orientation", () => {
    const opts = buildMetadataOptions(
      { orientation: 6 },
      { preserveColorProfile: false, preserveOrientation: true },
    );
    expect(opts).toEqual({ orientation: 6 });
  });

  it("只开 orientation 但原图没有 → 仍返回空（不无中生有）", () => {
    const opts = buildMetadataOptions(
      {},
      { preserveColorProfile: false, preserveOrientation: true },
    );
    expect(opts).toEqual({});
  });

  it("只开色彩 → 不写 orientation 字段（由 sharp 默认 ICC 保留处理）", () => {
    const opts = buildMetadataOptions(
      { orientation: 8 },
      { preserveColorProfile: true, preserveOrientation: false },
    );
    expect(opts).toEqual({});
  });

  it("两个都开且原图有 orientation → orientation 写入", () => {
    const opts = buildMetadataOptions(
      { orientation: 3 },
      { preserveColorProfile: true, preserveOrientation: true },
    );
    expect(opts).toEqual({ orientation: 3 });
  });

  it("orientation = 1（正向）也应传入，让 sharp 显式标记而非默认 strip", () => {
    const opts = buildMetadataOptions(
      { orientation: 1 },
      { preserveColorProfile: false, preserveOrientation: true },
    );
    expect(opts).toEqual({ orientation: 1 });
  });
});
