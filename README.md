# SimpleImageCompress

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20arm64-blue.svg)](#mac-打包)

SimpleImageCompress 当前是一个纯本地的桌面图片压缩工具原型，但产品最终目标不是“单一压图工具”，而是一个面向美术与资源处理流程的图像资产工具集合。

长期形态会逐步扩展为：

- 图片压缩
- 图集打包
- 图集增量打包
- 图集拆分
- 其他围绕图片资源加工的离线工具

这份 README 只保留“快速进入项目”所需的信息。  
如果要接手开发、定位功能、继续迭代，请先看：

- [docs/DEVELOPMENT.md](/Users/wepie/Documents/Github/SimpleImage/docs/DEVELOPMENT.md)

## 当前能力

- Electron + TypeScript + Preact + Vite 桌面应用
- macOS 系统设置风格 UI（vibrancy 毛玻璃 + 暗色模式自动跟随系统）
- 工具首页与多工具导航壳子（按工具模块隔离的 state）
- 本地文件选择、输出目录选择
- 拖拽导入与目录递归扫描（自动跳过隐藏文件与 node_modules 等大目录）
- JPG / PNG / GIF 压缩
- SVG 优化
- JPG / PNG / GIF 目标大小压缩
- JPG / PNG 导出为 WebP / JPG / PNG
- 原文件夹 / 覆盖原文件 / 自定义文件夹 保存路径策略
- 4 个内置压缩预设（网页配图 / 社交分享 / 归档高质量 / 最小体积）+ 自定义检测
- GIF/SVG 兼容性预防提示（选错输出格式即时告警 + 一键修复）
- 压缩结果列表显示前后大小对比、打开文件、Finder 显示、失败重试
- 图集打包（MaxRects 算法）：实时预览、参数面板、4 种元数据格式（Cocos2d-x plist / TexturePacker JSON Hash / JSON Array / CSS Sprite）、支持 trim / rotate / POT / 多页输出

## 环境要求

- macOS
- Node.js 20+
- npm 10+
- 本地可用 `iconutil`（macOS 自带，用于生成 `.icns`）

## 快速开始

```bash
npm install
npm run dev
```

开发模式会同时启动 Vite 和 Electron。

## 构建与本地验证

```bash
npm run build
npm start
```

`npm start` 会直接加载 `dist/index.html`，适合本地验证构建结果。

## Mac 打包

生成图标资源：

```bash
npm run assets:icons
```

生成本地 `.app` 目录：

```bash
npm run pack:mac
```

生成可分发的 `.dmg` 和 `.zip`：

```bash
npm run dist:mac
```

当前产物默认输出到 `release/`，例如：

- `release/mac-arm64/SimpleImageCompress.app`
- `release/SimpleImageCompress-0.1.0-arm64.dmg`
- `release/SimpleImageCompress-0.1.0-arm64.zip`

补充说明：

- 当前已能完成本地签名和打包
- 当前未配置 notarization，所以是“可本地分发测试”的版本，不是完整的公网发行版

## 文档索引

- [docs/DEVELOPMENT.md](/Users/wepie/Documents/Github/SimpleImage/docs/DEVELOPMENT.md): 开发交接文档，包含架构、关键模块、数据流、已知限制、后续建议

## 当前优先事项

压缩与图集打包两个模块已完成 MVP。剩余优先事项：

1. 图集增量打包（变更资源的增量更新）
2. 图集拆分（已有图集恢复为单图）
3. 接入 notarization 和正式发布流程
4. 大文件/长任务的流式进度反馈（目前 archive 预设下 1MB GIF 约 3 秒，更大文件/批量打包暂时只有整体 loading）

## 中长期方向

项目骨架已经按"工具首页 + 独立工具模块"组织。新增工具时遵循：

- 主进程：`electron/tools/<tool>.cjs` 单独模块，自行注册 `tools:<tool>:*` IPC 命名空间
- 渲染层：`src/tools/<tool>/` 子目录（view + state + 子组件），通用 UI 抽到 `src/components/`
- preload：`window.simpleImage.tools.<tool>.*` 命名空间暴露 API
