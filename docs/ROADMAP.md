# 路线图（接手参考）

记录项目当前状态、明确不做的、可做但未做的方向。给未来回来时一个起点。

## 已完成

### 工具（7 个）
- compress（图片压缩，预设 + GIF 优化）
- atlas-pack（图集打包，MaxRects + 4 种元数据 + 实时预览）
- atlas-unpack（图集拆分）
- atlas-incremental（merge 模式 + 拆图缓存）
- icon-gen（macOS / Windows / Web / PWA 全套）
- image-diff（像素级 diff + 差异指标）
- batch-rename（前缀 / 后缀 / 序号 / 正则）

### 基础设施
- Preact + Context/Reducer 状态管理
- IPC 命名空间化 + preload contextBridge
- 流式进度（所有 7 个工具一致）
- 批量任务并发（worker pool 限流，默认 4 并发；compress / atlas-unpack / atlas-incremental 都已接入）
- macOS Settings 风格 UI（vibrancy + 主题切换）
- ErrorBoundary 隔离工具崩溃
- Toast 通知 + ARIA 可访问性
- 应用菜单 + 全局快捷键（Cmd+1~8 切工具 / Cmd+Enter 主操作）
- 输出目录 / 主题持久化（userData/settings.json）
- Motion polish（切换 fade-in / 按下感 / hover lift）+ reduce-motion 尊重

### 工程基础设施
- 52 个 vitest 单元测试覆盖关键纯函数
- GitHub Actions CI（push/PR 自动跑 test + build）
- MIT 协议 + LGPL libvips 归属（THIRD_PARTY_NOTICES）
- 三份文档：README（产品）/ USAGE（用户）/ DEVELOPMENT（开发者）

## 明确不做（带原因）

- **notarization / 公网发布**：需要 Apple 开发者账号，目前定位"本地工具"，无上架计划
- **跨平台 Windows / Linux**：sharp 跨平台 OK，但 iconutil 是 macOS 独有；UI 用 vibrancy 也是 macOS 特性。短期不投入移植成本
- **AI 增强（超分 / 智能裁剪）**：偏离图像资产工具的核心定位，门槛太高（要本地推理模型）

## 可做但未做（按 ROI 排序）

### 中价值
- **首次启动引导（onboarding tour）**：首次打开高亮各工具卡片 + 示范工作流
- **设置中心**：当前主题在标题栏、输出目录散在各工具，可以聚合到一个"设置"页
- **CLI 模式**：让 electron app 接受 `--compress=path` 命令行（适合自动化）

### 小价值（拾遗）
- **拖拽视觉反馈**：所有 drop zone 加更明显的 hover-dragging 高亮
- **快捷键提示气泡**：第一次进入工具时浮窗显示"按 Cmd+Enter 跑"
- **任务历史**：localStorage 记最近 N 次操作，方便回滚 / 重复执行
- **CLI 模式**：electron app 也能接受 `--compress=path/to/file` 命令行参数（适合自动化）

### 测试扩展
- **e2e 测试**：用临时小图测整个工具流程（用 vitest + 真实 sharp）
- **压力测试**：跑大量文件（1000+）看性能瓶颈

## 已知的小限制（不修也能用）

- atlas-pack 子图名 = 文件 basename。如果子图在不同目录但同名会冲突 → 用 batch-rename 先做规范化
- atlas-incremental 不支持显式删除 frame → 要删就走 atlas-unpack → 手动删 → atlas-pack 重打
- compress 的 SVG 只能输出 SVG，GIF 只能输出 GIF
- image-diff 两张图尺寸不同时用 contain 缩放，不是 cover —— 内容靠透明填充对齐，不会变形但有"留白"
- 输出目录权限不足时报错，目前 UI 显示 toast，没有自动 fallback 到桌面

## 文件位置约定（新加工具时）

跟 7 个工具完全一致：
1. `electron/tools/<tool>.cjs` — 主进程实现 + `register(ipcMain)`
2. `src/tools/<tool>/{state,view}.tsx` — Provider + 主视图
3. `src/shared/types.ts` — 加 payload / result 类型 + `ToolKey` 枚举
4. `src/shared/global.d.ts` — preload 类型同步
5. `electron/preload.cjs` — `tools.<tool>` 命名空间
6. `electron/main.cjs` — 引入 + `register`
7. `src/tools/tool-meta.ts` — label / description / status
8. `src/components/workspace.tsx` — case 路由
9. `src/App.tsx` — Provider 嵌套
10. `electron/main.cjs` 的 `TOOL_MENU_ITEMS` — 加快捷键
11. `src/components/home.tsx` — `TOOL_CAPABILITIES` 加能力 bullet
12. `electron/tools/<tool>.test.mjs` — 单元测试（如果有纯函数）
