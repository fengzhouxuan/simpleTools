# SimpleImageCompress 开发交接文档

## 1. 项目定位

SimpleImageCompress 当前是一个纯本地的 macOS 桌面图片压缩工具，但这只是第一阶段。

产品最终目标应理解为：

- 一个纯本地的图像资产工具集合
- 面向图片资源处理链路，而不是只做单点压缩
- 第一阶段先完成“图压替代品”
- 第二阶段再扩展成多工具工作台

明确的潜在模块包括：

- 图片压缩
- 图集打包
- 图集增量打包
- 图集拆分

当前项目的设计原则：

- 所有压缩都在本地完成，不依赖服务端
- 优先保证 Apple Silicon 可运行、可打包
- 先做“可替代核心工作流”，再逐步补高级能力
- UI 参考图压，但实现不追求像素级 1:1
- 当前实现可以先偏单工具，但架构上不要把“只会压图”写死

## 2. 技术栈

- 桌面壳：Electron
- 渲染层：TypeScript + **Preact** + Vite（参考 macOS 系统设置 UI 风格，支持暗色模式）
- 状态管理：Preact Context + useReducer，按工具模块隔离 state
- 主进程图片处理：
  - `sharp` 负责 JPG / PNG / GIF / WebP 处理
  - `svgo` 负责 SVG 优化
- 打包：`electron-builder`

当前没有后端服务，也没有数据库。

## 2.1 后续架构方向

如果产品确定会扩展成工具集合，建议尽早按下面的思路重构，而不是继续把所有逻辑塞进当前页面：

- `tools/compress`
  图片压缩模块
- `tools/atlas-pack`
  图集打包模块
- `tools/atlas-incremental`
  图集增量打包模块
- `tools/atlas-unpack`
  图集拆分模块

更具体一点：

- 主进程负责通用能力：
  - 文件系统访问
  - 任务执行
  - 日志
  - 打开 Finder / 打开文件
  - 后续可扩展为统一任务队列
- 渲染层负责：
  - 工具首页
  - 每个工具独立页面
  - 每个工具自己的参数面板和结果区
- 每个工具都应该有自己独立的参数模型，不要继续共用一个越来越大的 `state`

## 3. 目录结构

```text
SimpleImage/
├─ electron/
│  ├─ main.cjs                # 主进程入口：窗口、生命周期、注册各工具 IPC
│  ├─ preload.cjs             # contextBridge 暴露 window.simpleImage.*
│  ├─ core/
│  │  └─ fs.cjs               # 通用文件能力：选择、扫描、打开、Finder
│  └─ tools/
│     └─ compress.cjs         # 压缩工具的 IPC 与 sharp/svgo 实现
├─ src/
│  ├─ main.tsx                # Preact 渲染入口
│  ├─ App.tsx                 # 根组件，承载 Provider + 整窗布局
│  ├─ style.css               # 全部样式（macOS Settings 风，含暗色模式）
│  ├─ state/
│  │  └─ navigation.tsx       # 全局导航 state（currentTool）
│  ├─ shared/
│  │  ├─ types.ts             # 跨模块类型定义
│  │  ├─ global.d.ts          # window.simpleImage 类型声明
│  │  └─ format.ts            # 文件大小/路径/比率格式化
│  ├─ components/             # 跨工具复用组件
│  │  ├─ workspace.tsx        # 工具内容路由
│  │  ├─ tool-nav.tsx         # 左侧导航
│  │  ├─ home.tsx             # 首页视图
│  │  ├─ placeholder.tsx      # 图集等未实现工具的占位
│  │  ├─ file-import.tsx      # 拖拽/选择导入区
│  │  └─ result-list.tsx      # 文件/结果列表，支持 actions
│  ├─ tools/
│  │  ├─ tool-meta.ts         # 工具清单元数据
│  │  └─ compress/
│  │     ├─ view.tsx          # 压缩工具主视图
│  │     ├─ state.tsx         # 压缩工具 state（reducer + Provider）
│  │     ├─ presets.ts        # 4 个内置预设
│  │     └─ preset-bar.tsx    # 预设选择条
│  └─ assets/
├─ scripts/
│  └─ generate-icons.mjs      # 生成 icon.svg/png/icns
├─ build/                     # 图标等构建资源
├─ dist/                      # Vite 构建产物
├─ release/                   # Electron 打包产物
├─ package.json
└─ README.md
```

新增工具时的目录约定：

- `electron/tools/<tool>.cjs` 单独模块，导出 `register(ipcMain)`，自行声明 `tools:<tool>:*` IPC
- `src/tools/<tool>/` 子目录（view + state + 子组件），UI 复用部分抽到 `src/components/`
- preload 在 `tools.<tool>` 命名空间下暴露 API，避免命名冲突
- `src/tools/tool-meta.ts` 加新工具的 label/description/status，导航自动出现

## 4. 运行方式

### 4.1 安装依赖

```bash
npm install
```

### 4.2 开发模式

```bash
npm run dev
```

会并行启动：

- `vite` 开发服务器
- `electron .`

其中 Electron 会通过环境变量 `SIMPLEIMAGE_DEV_SERVER_URL` 加载本地开发页面。

### 4.3 构建验证

```bash
npm run build
npm start
```

`npm start` 会直接打开 `dist/index.html`，适合验证“构建态是否工作正常”。

### 4.4 Mac 打包

```bash
npm run pack:mac
```

会执行：

1. `npm run build`
2. `npm run assets:icons`
3. `electron-builder --mac dir --arm64`

输出位置：

- `release/mac-arm64/SimpleImageCompress.app`

可分发产物：

```bash
npm run dist:mac
```

输出：

- `release/SimpleImageCompress-<version>-arm64.dmg`
- `release/SimpleImageCompress-<version>-arm64.zip`

## 5. 当前功能清单

### 5.1 已实现

- 工具首页
- 左侧多工具导航壳子
- 压缩工具独立模块页面
- 图集打包 / 增量打包 / 图集拆分占位入口
- Finder 拖拽导入图片
- 文件选择导入
- 目录扫描导入
- JPG / PNG / GIF 压缩
- SVG 优化
- JPG / PNG / GIF 目标大小压缩
- JPG / PNG 导出为 `JPG / PNG / WebP / 原格式`
- GIF 仅支持导出为 GIF
- SVG 仅支持导出为 SVG
- 宽高缩放
- 保持宽高比
- 拉伸 / 裁剪 模式
- 保存路径策略：
  - 原文件夹
  - 覆盖原文件
  - 自定义文件夹
- 结果汇总与列表展示
- 列表右侧显示压缩前后大小对比

### 5.2 尚未完成

- 递归扫描目录
- 忽略隐藏文件和系统垃圾文件
- 结果列表操作：
  - 打开输出文件
  - 在 Finder 中显示
  - 单条重试
- 压缩预设
- 发布级 notarization

### 5.3 规划中但尚未开始

- 图集打包
- 图集增量打包
- 图集拆分

## 6. 核心代码入口

### 6.1 主进程

主进程已拆分为：

- [electron/main.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/main.cjs)
  入口。`createWindow()` 创建窗口（含 `vibrancy: "sidebar"` 取毛玻璃），并调用 `core.register(ipcMain)` 与 `compress.register(ipcMain)` 注册各模块 IPC。
  保留 `did-fail-load` / `preload-error` / `render-process-gone` 错误日志。
  设 `SIMPLEIMAGE_DEBUG=1` 启动时会自动打开 DevTools。

- [electron/core/fs.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/core/fs.cjs)
  通用文件能力（不绑定具体工具），导出 `register(ipcMain)`：
  - `collectFromDirectory()` 递归扫描，跳过隐藏文件 / `node_modules` 等大目录，安全阀 `MAX_SCAN_FILES=5000`、`MAX_SCAN_DEPTH=16`
  - `pickFiles` / `pickFolder` / `scanDirectory` / `normalizePaths`
  - `openPath` / `revealInFolder`（基于 `shell.openPath` 与 `shell.showItemInFolder`）

- [electron/tools/compress.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/tools/compress.cjs)
  压缩工具实现，导出 `register(ipcMain)` 注册 `tools:compress:run`：
  - `resolveSaveTarget()` 处理"原文件夹 / 覆盖原文件 / 自定义文件夹"三种输出策略
  - `compressRasterToTargetSize()` / `compressGifToTargetSize()` 按目标体积二分查找
  - `compressSvg()` SVG 优化
  - GIF 编码 `effort` 固定为 7（libvips 默认值），避免 quality 推到 9~10 时大 GIF 卡死
  - 每个文件压缩前后会在主进程终端打印 `[compress] start/done/fail` 进度日志

### 6.2 预加载层

文件：[electron/preload.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/preload.cjs)

`contextBridge` 暴露 `window.simpleImage`，按命名空间组织：

- `core.fs.*` — 通用文件能力（pickFiles / pickFolder / scanDirectory / normalizePaths / openPath / revealInFolder）
- `core.webUtils.getPathForFile(file)` — 从渲染层 File 对象拿真实路径
- `tools.compress.run(payload)` — 跑批压缩

新增工具的能力时遵循这条链路：

1. `electron/tools/<tool>.cjs` 内 `register(ipcMain)` 加 `ipcMain.handle("tools:<tool>:<action>", ...)`
2. `electron/main.cjs` 引入并调用该模块的 `register`
3. `electron/preload.cjs` 在 `tools.<tool>` 命名空间下加方法
4. `src/shared/global.d.ts` 同步类型
5. 渲染层通过 `window.simpleImage.tools.<tool>.<action>(...)` 调用

### 6.3 渲染层

入口：[src/main.tsx](/Users/wepie/Documents/Github/SimpleImage/src/main.tsx) → [src/App.tsx](/Users/wepie/Documents/Github/SimpleImage/src/App.tsx)

前端用 **Preact** 组件化实现，状态管理走 Context + useReducer。关键模式：

- 全局导航 state 在 [src/state/navigation.tsx](/Users/wepie/Documents/Github/SimpleImage/src/state/navigation.tsx)（只放 `currentTool`）
- 每个工具的 state 单独 Provider，放在 `src/tools/<tool>/state.tsx`
- `App.tsx` 嵌套 `NavigationProvider` + `CompressProvider`，后续工具 Provider 同样嵌套
- 视图通过 [src/components/workspace.tsx](/Users/wepie/Documents/Github/SimpleImage/src/components/workspace.tsx) 根据 `currentTool` 路由

压缩工具关键文件：

- [src/tools/compress/state.tsx](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/state.tsx)
  - reducer 支持 `patch` / `import` / `clear` / `replace-result` / `apply-preset`
  - `patch` 自动检测 preset-sensitive 字段（quality/format/resize 等），用户改任何这些字段会切到 `preset: "custom"`
  - 暴露 `runCompression` / `retryItem` / `applyPreset` 等方法
- [src/tools/compress/view.tsx](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/view.tsx) 主视图
- [src/tools/compress/presets.ts](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/presets.ts) 4 个预设定义 + 敏感字段列表
- [src/tools/compress/preset-bar.tsx](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/preset-bar.tsx) macOS segmented-control 风的预设条

通用组件：

- [src/components/file-import.tsx](/Users/wepie/Documents/Github/SimpleImage/src/components/file-import.tsx) 拖拽/选择区
- [src/components/result-list.tsx](/Users/wepie/Documents/Github/SimpleImage/src/components/result-list.tsx) 文件列表，接 `actions?` props 渲染"打开/Finder/重试"按钮

### 6.4 样式层

文件：[src/style.css](/Users/wepie/Documents/Github/SimpleImage/src/style.css)

当前样式是单文件维护，里面混合了：

- 全局变量
- 标题栏样式
- 空状态样式
- 列表样式
- 表单样式
- 底部设置区样式

如果后面继续迭代 UI，建议按区域拆分注释块，或者迁移到更模块化的样式组织方式。

## 7. 当前数据流

### 7.1 导入文件

1. 用户拖拽、选文件、选目录
2. 渲染层调用 `window.simpleImage.*`
3. `preload.cjs` 转发到 IPC
4. `main.cjs` 读取本地文件信息并返回 `InputFile[]`
5. 渲染层合并到 `state.files`
6. `render()` 重绘列表

### 7.2 执行压缩

1. 用户点击“再次压缩”
2. 渲染层从 `state` 组装压缩参数
3. 调用 `window.simpleImage.compressImages(...)`
4. 主进程按文件逐个压缩并返回 `CompressionResult[]`
5. 渲染层写入 `state.results`
6. 列表从“导入态”切换为“结果态”

### 7.3 列表显示规则

- `state.results.length === 0`
  显示导入文件列表
- `state.results.length > 0`
  显示压缩结果列表

结果态右侧信息：

- 压缩前大小
- 压缩后大小

导入态右侧信息：

- 压缩前大小
- 压缩后占位文案 `待压缩`

### 7.4 未来建议的数据流

如果进入多工具阶段，建议把当前“单一页面状态流”升级成：

1. 当前工具类型
2. 当前工具参数
3. 当前工具任务列表
4. 当前工具执行结果

也就是说，状态不再只围绕“压缩图片”组织，而是围绕“当前激活工具”组织。

## 8. 当前状态对象说明

`src/main.ts` 中的 `state` 是当前前端唯一状态源。

关键字段：

- `currentTool`
  当前激活的工具模块
- `files`
  当前导入文件列表
- `results`
  当前压缩结果列表
- `outputDir`
  自定义输出目录
- `quality`
  质量模式数值
- `targetSizeKB`
  目标大小模式数值
- `resizeWidth` / `resizeHeight`
  缩放尺寸
- `preserveAspect`
  是否保持宽高比
- `resizeMode`
  `stretch` 或 `crop`
- `mode`
  `quality` 或 `target-size`
- `outputFormat`
  `original` / `jpg` / `png` / `webp`
- `saveMode`
  `source` / `overwrite-source` / `custom`
- `running`
  是否正在压缩
- `showAdvanced`
  是否展开更多设置

## 9. 已知限制和坑

### 9.1 目录扫描的安全阀

`collectFromDirectory()` 已改为递归，但有上限：`MAX_SCAN_FILES=5000` / `MAX_SCAN_DEPTH=16`。会跳过：

- 名字以 `.` 开头的隐藏文件/目录
- `node_modules / __MACOSX / $RECYCLE.BIN / System Volume Information`

如果将来需要扫的目录类型更复杂（例如游戏资源根），可以让上限可配置。

### 9.2 前端是 Preact 组件化

不再有全量重绘问题。新增功能时直接写 Preact 组件 + 用 Context/hooks。注意：

- 不要把工具特定的 state 加到 `state/navigation.tsx`，新工具开自己的 Provider
- 跨工具复用 UI 抽到 `src/components/`，工具特有 UI 留在 `src/tools/<tool>/`

### 9.3 Electron 打包后要注意相对资源路径

项目已经改过一次这个问题。  
打包态必须使用相对资源路径，当前依赖的是 `vite.config.ts` 里的配置。

如果以后页面打包后再次出现“空白页”，先检查这一层。

### 9.4 GIF / SVG 有格式限制

- GIF 当前仅支持保持为 GIF
- SVG 当前仅支持保持为 SVG

主进程层会 throw，渲染层会在用户选错输出格式时显示警告横幅 + 一键修复按钮。

### 9.5 覆盖原文件模式存在真实写盘风险

这是符合产品预期的，但开发时要知道：

- 一旦选择"覆盖原文件"，真的会修改原始文件
- 测试时最好先用副本目录，不要直接拿重要素材试

### 9.6 GIF 压缩特性

- GIF 编码 `effort` 固定 7（libvips 默认值）；之前 `effort` 跟 quality 滑块绑定，质量 92 推到 effort=9~10 时大 GIF 可能要几十秒到几分钟
- "质量"滑块对 GIF 等价于颜色数控制（约 32 ~ 256 色）
- 想真正压小 GIF 必须降质量或用"最小体积"预设；高质量预设（archive）下 GIF 几乎不压缩，这是 GIF 格式特性而非 bug

## 10. 推荐接手顺序

新同学接手时，建议顺序如下：

1. 先跑 `npm install && npm run dev`
2. 拖几张 JPG / PNG / GIF / SVG 试一遍基本流程，包括切预设和列表交互
3. 再跑 `npm run pack:mac` 验证打包
4. 阅读这几个文件（约 30 分钟读完）：
   - [electron/main.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/main.cjs) — 主进程入口与模块注册
   - [electron/core/fs.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/core/fs.cjs) — 通用文件能力
   - [electron/tools/compress.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/tools/compress.cjs) — 压缩工具实现
   - [electron/preload.cjs](/Users/wepie/Documents/Github/SimpleImage/electron/preload.cjs) — IPC 桥接
   - [src/App.tsx](/Users/wepie/Documents/Github/SimpleImage/src/App.tsx) — 渲染根
   - [src/tools/compress/state.tsx](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/state.tsx) — 压缩 state（reducer 模式）
   - [src/tools/compress/view.tsx](/Users/wepie/Documents/Github/SimpleImage/src/tools/compress/view.tsx) — 压缩主视图
5. 再开始改功能，不要直接从样式下手

## 11. 推荐下一步开发顺序

压缩工具已经稳定可用（递归扫描、列表交互、预设、GIF 提示均完成）。下一步建议：

### 11.1 图集打包模块（第二阶段重心）

按现有目录约定开新模块：

1. 在 [src/tools/tool-meta.ts](/Users/wepie/Documents/Github/SimpleImage/src/tools/tool-meta.ts) 把 atlas-pack 状态从 planned 改成 available
2. 新建 `electron/tools/atlas-pack.cjs`：导出 `register(ipcMain)`，自行声明 `tools:atlas-pack:*` IPC
3. 新建 `src/tools/atlas-pack/` 子目录：state.tsx + view.tsx
4. 在 [src/App.tsx](/Users/wepie/Documents/Github/SimpleImage/src/App.tsx) 加 `AtlasPackProvider` 嵌套
5. 在 [src/components/workspace.tsx](/Users/wepie/Documents/Github/SimpleImage/src/components/workspace.tsx) 路由该工具到自己的 view
6. preload + global.d.ts 同步类型

### 11.2 后续

1. 图集增量打包、图集拆分（接 atlas-pack 之后）
2. 大 GIF / 大批量任务的流式进度反馈（IPC 加 `event.sender.send`）
3. notarization 与正式发布

## 12. 发布说明

当前是“本地测试可分发”状态，不是完整正式发布状态。

现状：

- 本地构建可用
- 本地打包可用
- 本地签名可用
- notarization 未接入

所以目前适合：

- 本机安装测试
- 小范围手动分发

还不适合：

- 面向大量普通用户公开发布

## 13. 文档维护约定

如果后面继续迭代，建议把下面几类变化同步写回本文档：

- 新增了哪些 IPC 能力
- 输出策略或压缩策略是否变了
- 哪些格式支持矩阵变化了
- 目录结构是否调整了
- 发布流程是否调整了

否则 README 和代码很容易再次脱节。
