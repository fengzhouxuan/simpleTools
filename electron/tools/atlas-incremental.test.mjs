import { describe, it, expect } from "vitest";
import atlasIncremental from "./atlas-incremental.cjs";

const { mergeInputs, computeDiff } = atlasIncremental.__test__;

// ============================================================
// computeDiff: 旧 frame 名集合 vs 新源 basename 集合
// added = 新源里没有同名旧 frame
// modified = 新源里有同名旧 frame
// unchanged = 旧 frame 名没被新散图覆盖
// merge 模式没有 "removed"（永远空数组）
// ============================================================

describe("computeDiff (merge 模式语义)", () => {
  const oldFrames = [
    { name: "hero.png" },
    { name: "coin.png" },
    { name: "enemy.png" },
  ];

  it("无新源：全部 unchanged，无 added/modified", () => {
    const diff = computeDiff(oldFrames, []);
    expect(diff.added).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged.sort()).toEqual(["coin.png", "enemy.png", "hero.png"]);
  });

  it("新源里有同名 → modified；不同名 → added", () => {
    const diff = computeDiff(oldFrames, [
      "/path/to/hero.png",   // 同名 → modified
      "/path/to/new1.png",   // 新 → added
      "/path/to/new2.png",   // 新 → added
    ]);
    expect(diff.modified).toEqual(["hero.png"]);
    expect(diff.added.sort()).toEqual(["new1.png", "new2.png"]);
    expect(diff.unchanged.sort()).toEqual(["coin.png", "enemy.png"]);
    expect(diff.removed).toEqual([]); // merge 模式永远空
  });

  it("新源覆盖所有旧 frame：unchanged 空，无新增", () => {
    const diff = computeDiff(oldFrames, [
      "/p/hero.png",
      "/p/coin.png",
      "/p/enemy.png",
    ]);
    expect(diff.modified.sort()).toEqual([
      "coin.png",
      "enemy.png",
      "hero.png",
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("新源跟旧 frame 完全不重叠：所有旧 frame unchanged，新源全部 added", () => {
    const diff = computeDiff(oldFrames, [
      "/p/a.png",
      "/p/b.png",
    ]);
    expect(diff.added.sort()).toEqual(["a.png", "b.png"]);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged.sort()).toEqual(["coin.png", "enemy.png", "hero.png"]);
  });
});

// ============================================================
// mergeInputs: 旧 extracted 子图 + 新散图 → 打包用的 inputs 列表
// 新散图按 basename 覆盖同名旧子图
// ============================================================

describe("mergeInputs", () => {
  const extracted = [
    { path: "/tmp/old/hero.png", name: "hero.png" },
    { path: "/tmp/old/coin.png", name: "coin.png" },
  ];

  it("无新源：返回所有旧 extracted", () => {
    const merged = mergeInputs(extracted, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.name).sort()).toEqual(["coin.png", "hero.png"]);
    // 旧路径来自临时目录
    expect(merged.find((m) => m.name === "hero.png").path).toBe("/tmp/old/hero.png");
  });

  it("新源覆盖同名旧子图：用新散图路径，不用旧 extracted 路径", () => {
    const merged = mergeInputs(extracted, [
      "/new/hero.png",   // 同名 → 覆盖
      "/new/g.png",      // 新增
    ]);
    expect(merged).toHaveLength(3);
    const hero = merged.find((m) => m.name === "hero.png");
    expect(hero.path).toBe("/new/hero.png");  // 新散图路径
    const coin = merged.find((m) => m.name === "coin.png");
    expect(coin.path).toBe("/tmp/old/coin.png"); // 旧 extracted 路径（未覆盖）
    const g = merged.find((m) => m.name === "g.png");
    expect(g.path).toBe("/new/g.png");
  });
});
