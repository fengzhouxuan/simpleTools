// 用 .mjs 后缀走 Node ESM 路径；require CJS 模块走 default import
import { describe, it, expect } from "vitest";
import atlasUnpack from "./atlas-unpack.cjs";

const { parseMetadata, detectFormat } = atlasUnpack;

// ============================================================
// detectFormat：按扩展名 + 首字符内容判断格式
// ============================================================

describe("detectFormat", () => {
  it("plist 通过 XML 头识别", () => {
    expect(detectFormat("a.plist", '<?xml version="1.0"?>')).toBe("plist");
    expect(detectFormat("a.unknown", "<plist version=\"1.0\">")).toBe("plist");
  });

  it("css 通过 .class 规则首行识别", () => {
    expect(detectFormat("a.css", ".sprite-hero { background: url(x); }")).toBe("css");
  });

  it("json-hash：frames 是对象", () => {
    expect(
      detectFormat("a.json", '{"frames":{"hero.png":{}},"meta":{}}'),
    ).toBe("json-hash");
  });

  it("json-array：frames 是数组", () => {
    expect(
      detectFormat("a.json", '{"frames":[],"meta":{}}'),
    ).toBe("json-array");
  });

  it("不可解析的 JSON 兜底走 json-hash", () => {
    expect(detectFormat("a.json", "{ not json }")).toBe("json-hash");
  });
});

// ============================================================
// parseMetadata：4 种格式各自的解析
// ============================================================

describe("parseMetadata json-hash", () => {
  it("解析 TexturePacker JSON Hash 基础格式", () => {
    const json = JSON.stringify({
      frames: {
        "hero.png": {
          frame: { x: 10, y: 20, w: 32, h: 32 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          sourceSize: { w: 32, h: 32 },
        },
      },
      meta: { size: { w: 256, h: 256 } },
    });
    const r = parseMetadata(json, "json-hash");
    expect(r.atlasWidth).toBe(256);
    expect(r.atlasHeight).toBe(256);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].name).toBe("hero.png");
    expect(r.frames[0].x).toBe(10);
    expect(r.frames[0].y).toBe(20);
    expect(r.frames[0].width).toBe(32);
    expect(r.frames[0].rotated).toBe(false);
  });

  it("trim 信息被正确识别（sourceSize ≠ spriteSourceSize 时 trimmed=true）", () => {
    const json = JSON.stringify({
      frames: {
        "x.png": {
          frame: { x: 0, y: 0, w: 20, h: 20 },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 2, y: 3, w: 20, h: 20 },
          sourceSize: { w: 32, h: 32 },
        },
      },
      meta: { size: { w: 64, h: 64 } },
    });
    const r = parseMetadata(json, "json-hash");
    expect(r.frames[0].trimmed).toBe(true);
    expect(r.frames[0].trimX).toBe(2);
    expect(r.frames[0].trimY).toBe(3);
    expect(r.frames[0].sourceWidth).toBe(32);
    expect(r.frames[0].sourceHeight).toBe(32);
  });
});

describe("parseMetadata json-array", () => {
  it("解析 TexturePacker JSON Array 格式", () => {
    const json = JSON.stringify({
      frames: [
        {
          filename: "hero.png",
          frame: { x: 0, y: 0, w: 32, h: 32 },
          rotated: true,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          sourceSize: { w: 32, h: 32 },
        },
        {
          filename: "coin.png",
          frame: { x: 32, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
        },
      ],
      meta: { size: { w: 64, h: 32 } },
    });
    const r = parseMetadata(json, "json-array");
    expect(r.frames).toHaveLength(2);
    expect(r.frames[0].name).toBe("hero.png");
    expect(r.frames[0].rotated).toBe(true);
    expect(r.frames[1].name).toBe("coin.png");
    expect(r.atlasWidth).toBe(64);
  });
});

describe("parseMetadata plist", () => {
  it("解析 Cocos2d-x plist 基础格式（format 2）", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>hero.png</key>
    <dict>
      <key>frame</key>
      <string>{{4,8},{32,32}}</string>
      <key>rotated</key>
      <false/>
      <key>sourceColorRect</key>
      <string>{{0,0},{32,32}}</string>
      <key>sourceSize</key>
      <string>{32,32}</string>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>size</key>
    <string>{256,256}</string>
  </dict>
</dict>
</plist>`;
    const r = parseMetadata(plist, "plist");
    expect(r.atlasWidth).toBe(256);
    expect(r.atlasHeight).toBe(256);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].name).toBe("hero.png");
    expect(r.frames[0].x).toBe(4);
    expect(r.frames[0].y).toBe(8);
    expect(r.frames[0].width).toBe(32);
    expect(r.frames[0].rotated).toBe(false);
  });

  it("rotated=true 正确解析", () => {
    const plist = `<?xml version="1.0"?>
<plist><dict>
  <key>frames</key><dict>
    <key>a.png</key><dict>
      <key>frame</key><string>{{0,0},{16,16}}</string>
      <key>rotated</key><true/>
      <key>sourceColorRect</key><string>{{0,0},{16,16}}</string>
      <key>sourceSize</key><string>{16,16}</string>
    </dict>
  </dict>
  <key>metadata</key><dict>
    <key>size</key><string>{64,64}</string>
  </dict>
</dict></plist>`;
    const r = parseMetadata(plist, "plist");
    expect(r.frames[0].rotated).toBe(true);
  });
});

describe("parseMetadata css", () => {
  it("解析 .sprite-* 规则", () => {
    const css = `
.sprite-hero {
  background-image: url('atlas.png');
  background-position: -10px -20px;
  width: 32px;
  height: 32px;
}
.sprite-coin {
  background-image: url('atlas.png');
  background-position: -42px -0px;
  width: 16px;
  height: 16px;
}
.not-a-sprite-class {
  color: red;
}
`;
    const r = parseMetadata(css, "css");
    expect(r.frames).toHaveLength(2);
    const hero = r.frames.find((f) => f.name === "hero.png");
    expect(hero).toBeDefined();
    expect(hero.x).toBe(10);
    expect(hero.y).toBe(20);
    expect(hero.width).toBe(32);
    expect(hero.height).toBe(32);
  });
});
