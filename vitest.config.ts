import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["electron/**/*.test.{js,mjs,cjs}", "src/**/*.test.{ts,tsx}"],
    // 主进程 cjs 模块会 require sharp 等 native 包，给点超时余量
    testTimeout: 10_000,
  },
});
