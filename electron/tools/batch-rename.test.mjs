import { describe, it, expect } from "vitest";
import batchRename from "./batch-rename.cjs";

const { applyRules, splitNameExt, padNumber } = batchRename.__test__;

const emptyRules = {
  prefix: "",
  suffix: "",
  sequence: { enabled: false, start: 1, digits: 3, insertAt: "prefix" },
  regex: { enabled: false, pattern: "", flags: "g", replacement: "" },
};

describe("splitNameExt", () => {
  it("分离扩展名", () => {
    expect(splitNameExt("hero.png")).toEqual({ stem: "hero", ext: ".png" });
    expect(splitNameExt("a.b.c.png")).toEqual({ stem: "a.b.c", ext: ".png" });
    expect(splitNameExt("noext")).toEqual({ stem: "noext", ext: "" });
    expect(splitNameExt(".hidden")).toEqual({ stem: ".hidden", ext: "" });
  });
});

describe("padNumber", () => {
  it("补零到指定位数", () => {
    expect(padNumber(1, 3)).toBe("001");
    expect(padNumber(42, 4)).toBe("0042");
    expect(padNumber(1234, 3)).toBe("1234"); // 超过位数不截断
  });
});

describe("applyRules - 前缀/后缀", () => {
  const files = [
    { path: "/a/hero.png", name: "hero.png" },
    { path: "/a/coin.png", name: "coin.png" },
  ];

  it("加前缀", () => {
    const plan = applyRules(files, { ...emptyRules, prefix: "ui_" });
    expect(plan[0].to).toBe("/a/ui_hero.png");
    expect(plan[1].to).toBe("/a/ui_coin.png");
    expect(plan[0].unchanged).toBe(false);
  });

  it("加后缀（在扩展名之前）", () => {
    const plan = applyRules(files, { ...emptyRules, suffix: "_v2" });
    expect(plan[0].to).toBe("/a/hero_v2.png");
    expect(plan[1].to).toBe("/a/coin_v2.png");
  });

  it("前缀 + 后缀同时", () => {
    const plan = applyRules(files, { ...emptyRules, prefix: "ui_", suffix: "_v2" });
    expect(plan[0].to).toBe("/a/ui_hero_v2.png");
  });

  it("无规则时 unchanged=true", () => {
    const plan = applyRules(files, emptyRules);
    expect(plan[0].unchanged).toBe(true);
    expect(plan[0].to).toBe(plan[0].from);
  });
});

describe("applyRules - 序号", () => {
  const files = [
    { path: "/a/x.png", name: "x.png" },
    { path: "/a/y.png", name: "y.png" },
    { path: "/a/z.png", name: "z.png" },
  ];

  it("序号前缀，从 1 开始 3 位", () => {
    const plan = applyRules(files, {
      ...emptyRules,
      sequence: { enabled: true, start: 1, digits: 3, insertAt: "prefix" },
    });
    expect(plan.map((p) => p.to)).toEqual([
      "/a/001x.png",
      "/a/002y.png",
      "/a/003z.png",
    ]);
  });

  it("序号后缀，从 10 开始 2 位", () => {
    const plan = applyRules(files, {
      ...emptyRules,
      sequence: { enabled: true, start: 10, digits: 2, insertAt: "suffix" },
    });
    expect(plan.map((p) => p.to)).toEqual([
      "/a/x10.png",
      "/a/y11.png",
      "/a/z12.png",
    ]);
  });

  it("序号 + 前缀组合", () => {
    const plan = applyRules(files, {
      ...emptyRules,
      prefix: "frame_",
      sequence: { enabled: true, start: 1, digits: 3, insertAt: "prefix" },
    });
    // 序号加在前 = stem 最前，前缀更前
    expect(plan[0].to).toBe("/a/001frame_x.png");
  });
});

describe("applyRules - 正则替换", () => {
  it("简单字符串替换（隐式按 RegExp）", () => {
    const files = [
      { path: "/a/Copy of hero.png", name: "Copy of hero.png" },
      { path: "/a/Copy of coin.png", name: "Copy of coin.png" },
    ];
    const plan = applyRules(files, {
      ...emptyRules,
      regex: { enabled: true, pattern: "^Copy of ", flags: "g", replacement: "" },
    });
    expect(plan[0].to).toBe("/a/hero.png");
    expect(plan[1].to).toBe("/a/coin.png");
  });

  it("正则带捕获组 $1", () => {
    const files = [{ path: "/a/IMG_1234.jpg", name: "IMG_1234.jpg" }];
    const plan = applyRules(files, {
      ...emptyRules,
      regex: {
        enabled: true,
        pattern: "IMG_(\\d+)",
        flags: "",
        replacement: "photo-$1",
      },
    });
    expect(plan[0].to).toBe("/a/photo-1234.jpg");
  });

  it("无效正则不应用（而非抛错）", () => {
    const files = [{ path: "/a/x.png", name: "x.png" }];
    const plan = applyRules(files, {
      ...emptyRules,
      regex: { enabled: true, pattern: "[unclosed", flags: "g", replacement: "" },
    });
    expect(plan[0].unchanged).toBe(true);
  });

  it("正则只作用于 stem，不影响扩展名", () => {
    const files = [{ path: "/a/png_file.png", name: "png_file.png" }];
    const plan = applyRules(files, {
      ...emptyRules,
      regex: { enabled: true, pattern: "png", flags: "g", replacement: "X" },
    });
    // stem "png_file" 里的 png 被替换，扩展名 .png 不变
    expect(plan[0].to).toBe("/a/X_file.png");
  });
});

describe("applyRules - 冲突检测", () => {
  it("两个文件经规则后撞名 → conflict=true", () => {
    const files = [
      { path: "/a/hero.png", name: "hero.png" },
      { path: "/b/hero.png", name: "hero.png" },
    ];
    // 两个文件在不同目录但同名，dirname 不同所以 to 路径不同，不冲突
    const plan = applyRules(files, { ...emptyRules, prefix: "ui_" });
    expect(plan[0].conflict).toBe(false);
    expect(plan[1].conflict).toBe(false);
  });

  it("同目录下规则后撞名 → conflict=true", () => {
    const files = [
      { path: "/a/hero.png", name: "hero.png" },
      { path: "/a/coin.png", name: "coin.png" },
    ];
    // 让正则把名字都替换成 same.png
    const plan = applyRules(files, {
      ...emptyRules,
      regex: { enabled: true, pattern: ".+", flags: "", replacement: "same" },
    });
    expect(plan[0].to).toBe("/a/same.png");
    expect(plan[1].to).toBe("/a/same.png");
    expect(plan[0].conflict).toBe(true);
    expect(plan[1].conflict).toBe(true);
  });
});
