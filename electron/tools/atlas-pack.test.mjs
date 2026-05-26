import { describe, it, expect } from "vitest";
import atlasPack from "./atlas-pack.cjs";

const { serializeMetadata, metadataExtension } = atlasPack;

const SAMPLE_PAGE = {
  index: 0,
  width: 256,
  height: 256,
  frames: [
    {
      name: "hero.png",
      sourcePath: "/src/hero.png",
      x: 10,
      y: 20,
      width: 32,
      height: 32,
      rotated: false,
      trimmed: false,
      sourceWidth: 32,
      sourceHeight: 32,
      trimX: 0,
      trimY: 0,
    },
    {
      name: "coin.png",
      sourcePath: "/src/coin.png",
      x: 42,
      y: 20,
      width: 16,
      height: 16,
      rotated: true,
      trimmed: true,
      sourceWidth: 20,
      sourceHeight: 20,
      trimX: 2,
      trimY: 2,
    },
  ],
};

// ============================================================
// metadataExtension：4 种格式各自的文件扩展名
// ============================================================

describe("metadataExtension", () => {
  it("各格式扩展名正确", () => {
    expect(metadataExtension("plist")).toBe("plist");
    expect(metadataExtension("json-hash")).toBe("json");
    expect(metadataExtension("json-array")).toBe("json");
    expect(metadataExtension("css")).toBe("css");
    expect(metadataExtension("unknown")).toBe("json"); // 兜底
  });
});

// ============================================================
// serializeMetadata：序列化产出能反过来被解析（roundtrip）
// 这里只检查关键字段存在 + 数值正确，不严格 byte-equal
// ============================================================

describe("serializeMetadata json-hash", () => {
  it("输出含 frames + meta + 子图坐标", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "json-hash");
    const parsed = JSON.parse(out);
    expect(parsed.frames["hero.png"]).toBeDefined();
    expect(parsed.frames["hero.png"].frame).toEqual({ x: 10, y: 20, w: 32, h: 32 });
    expect(parsed.frames["hero.png"].rotated).toBe(false);
    expect(parsed.meta.image).toBe("atlas.png");
    expect(parsed.meta.size).toEqual({ w: 256, h: 256 });
  });

  it("rotated 与 trim 信息正确序列化", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "json-hash");
    const parsed = JSON.parse(out);
    expect(parsed.frames["coin.png"].rotated).toBe(true);
    expect(parsed.frames["coin.png"].trimmed).toBe(true);
    expect(parsed.frames["coin.png"].sourceSize).toEqual({ w: 20, h: 20 });
    expect(parsed.frames["coin.png"].spriteSourceSize).toEqual({
      x: 2,
      y: 2,
      w: 16, // rotated=true 时 contentW = frame.height
      h: 16,
    });
  });
});

describe("serializeMetadata json-array", () => {
  it("frames 是数组形式，每项含 filename", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "json-array");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.frames)).toBe(true);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.frames[0].filename).toBe("hero.png");
    expect(parsed.frames[1].filename).toBe("coin.png");
  });
});

describe("serializeMetadata plist", () => {
  it("输出含 XML 声明 + DOCTYPE + frames dict", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "plist");
    expect(out).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(out).toContain('<!DOCTYPE plist PUBLIC');
    expect(out).toContain("<key>frames</key>");
    expect(out).toContain("<key>hero.png</key>");
    expect(out).toContain("<key>coin.png</key>");
    expect(out).toContain("<string>{{10,20},{32,32}}</string>"); // hero frame
    expect(out).toContain("<key>metadata</key>");
    expect(out).toContain("<string>{256,256}</string>"); // atlas size
  });

  it("rotated 子图正确输出 <true/>", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "plist");
    // coin.png 之后某行应有 rotated true
    const coinIdx = out.indexOf("<key>coin.png</key>");
    const nextDictEnd = out.indexOf("</dict>", coinIdx);
    const coinBlock = out.slice(coinIdx, nextDictEnd);
    expect(coinBlock).toContain("<true/>");
  });
});

describe("serializeMetadata css", () => {
  it("每个子图一条 .sprite-* 规则", () => {
    const out = serializeMetadata(SAMPLE_PAGE, "atlas.png", "css");
    expect(out).toContain(".sprite-hero {");
    expect(out).toContain(".sprite-coin {");
    expect(out).toContain("background-image: url('atlas.png');");
    expect(out).toContain("background-position: -10px -20px;"); // hero
    expect(out).toContain("width: 32px;");
    expect(out).toContain("height: 32px;");
  });
});
