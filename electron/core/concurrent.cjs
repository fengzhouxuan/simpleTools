// 限流并发执行 array.map：N 个 worker 共享一个游标，逐项消费
// 进度报告按"已完成数"递增（并发场景下"开始数"无序，没意义）
//
// 用法：
//   const results = await mapConcurrent(
//     files,
//     4,
//     async (file, i) => await processOne(file),
//     (p) => sender.send("progress", p),
//   );

async function mapConcurrent(items, concurrency, mapper, onProgress) {
  const total = items.length;
  if (total === 0) return [];

  const safeConcurrency = Math.max(1, Math.min(concurrency, total));
  const results = new Array(total);
  let nextIdx = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) return;
      try {
        results[idx] = await mapper(items[idx], idx);
      } catch (e) {
        // 把错误也存到 results，让调用方决定是 throw 还是收集
        results[idx] = { __error: e };
      }
      completed++;
      onProgress?.({
        current: completed,
        total,
        stage: `已完成 ${completed} / ${total}`,
      });
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, worker));

  // 把 __error 包装拆掉，原样 throw 第一个错（保留旧 for 循环的语义）
  for (const r of results) {
    if (r && r.__error) throw r.__error;
  }
  return results;
}

// 默认并发数：兼顾 sharp 内部 libuv 线程池（默认 4 线程）和 IO/CPU 平衡
const DEFAULT_CONCURRENCY = 4;

module.exports = { mapConcurrent, DEFAULT_CONCURRENCY };
