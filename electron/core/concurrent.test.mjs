import { describe, it, expect } from "vitest";
import concurrent from "./concurrent.cjs";

const { mapConcurrent } = concurrent;

describe("mapConcurrent", () => {
  it("空数组 → 立即返回空", async () => {
    const r = await mapConcurrent([], 4, async () => 1);
    expect(r).toEqual([]);
  });

  it("保留输入顺序，无视完成顺序", async () => {
    // 故意让前面的 item 比后面的慢，验证 results 按 index 排序
    const r = await mapConcurrent(
      [50, 10, 30, 5],
      4,
      async (delay, i) => {
        await new Promise((res) => setTimeout(res, delay));
        return i;
      },
    );
    expect(r).toEqual([0, 1, 2, 3]);
  });

  it("并发数 <= 1 时退化为串行（仍然正确）", async () => {
    const r = await mapConcurrent([1, 2, 3], 1, async (x) => x * 10);
    expect(r).toEqual([10, 20, 30]);
  });

  it("并发数 > items.length 时不开多余 worker", async () => {
    // 只 3 个 item，concurrency=100 不应该崩
    const r = await mapConcurrent([1, 2, 3], 100, async (x) => x + 1);
    expect(r).toEqual([2, 3, 4]);
  });

  it("onProgress 报告递增的 completed 数", async () => {
    const events = [];
    await mapConcurrent(
      [1, 2, 3, 4, 5],
      2,
      async (x) => {
        await new Promise((r) => setTimeout(r, 5));
        return x;
      },
      (p) => events.push({ current: p.current, total: p.total }),
    );
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.current)).toEqual([1, 2, 3, 4, 5]);
    expect(events.every((e) => e.total === 5)).toBe(true);
  });

  it("mapper 抛错时整体 reject", async () => {
    await expect(
      mapConcurrent([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });

  it("真正并发：4 个 worker 跑 20 项总耗时接近 20/4*单项耗时", async () => {
    const ITEM_DURATION = 30; // ms
    const ITEMS = 20;
    const start = Date.now();
    await mapConcurrent(
      Array.from({ length: ITEMS }, (_, i) => i),
      4,
      async () => {
        await new Promise((r) => setTimeout(r, ITEM_DURATION));
      },
    );
    const elapsed = Date.now() - start;
    // 串行 600ms，4 并发理论 150ms，给宽松上限 350ms（避免 CI 抖动 flaky）
    expect(elapsed).toBeLessThan(350);
    expect(elapsed).toBeGreaterThan(100); // 至少 4 批
  });
});
