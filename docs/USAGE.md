# SimpleImageCompress 使用指南

9 个工具的具体用法、典型场景、参数含义、常见坑。如果你只是想快速跑通，直接看每节的"典型流程"。

> 全局：`Cmd+1~9` 切前 9 个工具，`Cmd+Enter` 跑当前工具的主操作，`Cmd+,` 打开设置（macOS 标准）。
> 第 10 个工具（九宫格裁切）走菜单"工具 → 九宫格裁切"，没有数字快捷键。
>
> **CLI 模式**：6 个工具能从命令行跑（`simpleimage <cmd>`），见末节。元数据剥离 / 九宫格裁切 / 图集增量打包暂未提供 CLI。

---

## 1. 图片压缩（Cmd+2）

### 典型流程

1. 拖入或扫描目录导入图片
2. 选预设（默认是"归档高质量"，对任何输入都安全）
3. 选保存路径（原文件夹 / 覆盖原文件 / 自定义文件夹）
4. 点"再次压缩"（或 Cmd+Enter）

### 4 个预设含义

| 预设 | 适用 | 参数 |
|------|------|------|
| 网页配图 | Web 上传 | WebP + 质量 75 + 宽 1920 |
| 社交分享 | 朋友圈/Twitter | JPG + 质量 85 + 宽 1200 |
| 归档高质量 | 长期保存 | 原格式 + 质量 92 + 不缩放 |
| 最小体积 | 极限压缩 | 目标体积 200KB + 原格式 |

任何参数手动改动都会自动切到"自定义"。

### 模式对比

- **质量模式**：滑块控制压缩强度（1~10 档），快速
- **目标体积模式**：二分查找质量参数逼近你设的 KB 数，慢但精确

### 输出格式

- JPG / PNG → JPG / PNG / WebP / 保持原样
- GIF → 仅支持保持 GIF（动画特性需要专门处理）
- SVG → 仅支持保持 SVG（用 svgo 优化）

### 坑

- **GIF 压缩效果有限**：GIF 是 LZW 压缩格式，靠"减颜色数"才能瘦身。质量模式拉到 3~5（约 80~130 色），或直接走"最小体积"预设。工具会自动检测并给提示。
- **覆盖原文件模式真的会改原文件**，先用副本测试。

---

## 2. 图集打包（Cmd+3）

### 典型流程

1. 拖入小图集合（JPG / PNG / WebP，**不支持 SVG**）
2. 选预设：默认 / Cocos2d-x / Web 紧凑 / TexturePacker 兼容
3. 预览实时显示打包结果（左侧文件列表，右侧 canvas 预览红框标 frame）
4. 选输出目录 → 点"导出图集"

### 4 个预设

| 预设 | 适用 |
|------|------|
| 默认 | 2048×2048 + TexturePacker JSON，通用 |
| Cocos2d-x | POT 2048 + plist + padding 2，给 Cocos 引擎用 |
| Web 紧凑 | 1024 + JSON + padding 1，Web sprite 节省空间 |
| TexturePacker 兼容 | 2048 + rotate + JSON Array，对接 TexturePacker 生态 |

### 关键参数

- **最大宽高**：单页 atlas 的尺寸上限，超过会自动分页
- **POT**：强制 2 的幂尺寸（512/1024/2048）— 老 GPU 纹理压缩需要
- **trim**：去掉子图的 alpha 透明边（默认 on），节省空间
- **rotate**：允许子图旋转 90° 提高利用率
- **padding**：子图间距，避免渲染时采样到邻居像素（默认 2 够用）

### 4 种元数据格式

| 格式 | 后缀 | 主要用法 |
|------|------|---------|
| TexturePacker JSON Hash | .json | Phaser / Pixi.js / PixiJS / 自写引擎 |
| JSON Array | .json | 部分自写引擎 |
| Cocos2d-x plist | .plist | Cocos2d-x / Cocos Creator |
| CSS Sprite | .css | Web 雪碧图，配合 `<div class="sprite-xxx">` |

工具同时会写一份 `<name>.manifest.json`（含每子图的 sha1 指纹），给增量打包用。

### 坑

- 子图名（也是元数据里的 frame name）= 文件 basename。打包前最好用"批量重命名"统一格式。
- 利用率显示在顶部摘要：低于 70% 说明子图尺寸跨度大、padding 太大、或开了 POT 浪费空间。

---

## 3. 图集拆分（Cmd+4）

### 典型流程

1. 选 atlas 图片（选了会自动猜同目录同名元数据填进来）
2. 元数据没自动匹配就手动选
3. 工具显示解析出的所有子图列表
4. 选输出目录 → 点"拆分导出"

### "恢复 trim 前的原图尺寸"选项

- **勾选（默认）**：把 trim 过的子图扩回 sourceSize，缺失区域填透明。还原后的子图跟原始素材尺寸一致。
- **不勾选**：只输出 trim 后的可见区，尺寸通常比原图小。

### 自动识别

- 元数据格式自动判断（plist / JSON Hash / JSON Array / CSS Sprite）
- 选 atlas 自动找同名 `.json / .plist / .css`
- 反过来选元数据也自动找同名 `.png / .webp / .jpg`

---

## 4. 图集增量打包（Cmd+5）

### 工作流（merge 模式）

输入：旧 atlas + 旧元数据 + 想新增/修改的散图

工具自动：
1. 拆开旧 atlas 到临时目录
2. 把新散图覆盖同名旧子图（按文件名 basename 比对）
3. 用 atlas-pack 算法重新打包成单张新 atlas
4. 清理临时目录

### 差异面板

| chip | 含义 |
|------|------|
| 新增 | 新散图里没有同名旧 frame |
| 修改 | 新散图按 basename 覆盖了同名旧 frame |
| 复用 | 旧 frame 未被新散图覆盖，从旧 atlas 拆出来继续用 |

### 坑

- **删除子图怎么办**？merge 模式不支持显式删除。要删某个 frame，去 atlas-unpack 拆开 → 删 → atlas-pack 重打。
- **新散图名字必须跟旧 frame name 一致才能覆盖**，否则按"新增"处理。如果你看到"+X 改 0 复用 0 删 N"那是文件名对不上。

---

## 5. 图标生成（Cmd+6）

### 典型流程

1. 拖入或选一张大图（推荐 ≥ 1024×1024 透明 PNG）
2. 勾选目标格式（默认勾"macOS · icns"+"Web favicon"）
3. 选输出目录 → 点"一键生成"

### 4 个目标

| 目标 | 产出 |
|------|------|
| macOS · icns | `icon.icns`（含 16/32/64/128/256/512/1024 全套）|
| Windows · ico | `icon.ico`（含 16/32/48/64/128/256）|
| Web favicon | 7 张 PNG（含 `apple-touch-icon.png` 180×180）|
| PWA / 应用商店 | 3 张 PNG（192 / 512 / 1024）|

### 坑

- macOS `.icns` 走系统 `iconutil` 命令，macOS 自带不用装。其他平台不可用（CI 跑也只能跑 macos-latest）。
- Windows `.ico` 通过 `to-ico` 库合成，纯 JS。
- 单个目标失败不影响其他（比如机器没 iconutil，icns 单失败但 favicon 照常输出）。

---

## 6. 图片对比（Cmd+7）

### 用途

- 验证压缩后图片质量损失
- 验证图集拆分还原是否一致
- 对比两个版本的素材差异
- A/B 视觉测试

### 典型流程

1. 选图 A 和图 B（任意顺序，工具会自动跑 diff）
2. 看 diff 列：红色高亮的就是不同的像素
3. 看底部 4 个统计 chip

### 关键参数

- **差异阈值**（0~255）：单通道差异低于此值视为"相同"
  - `0` = 严格比对（任何 bit 差都算）
  - `5` 左右 = 消除 JPEG 重编码噪声
  - `15~30` = 容忍较大的色调偏移

### 4 个指标

- **不同像素数**：超过阈值的像素总数
- **占比**：不同像素 / 总像素
- **最大差**：所有像素中最大的单通道差异
- **平均差**：所有像素的平均差异

### 坑

- 两张图尺寸不一致时，工具自动用 `contain` 缩放到 max(A, B) 后比对。如果 A 是 100×100、B 是 200×200，B 不会变形，A 会被居中放到 200×200 透明背景上。
- 大图（> 4096 边）会先缩放再 diff，避免内存爆炸。

---

## 7. 批量重命名（Cmd+8）

### 用途

- 美术/外包素材命名规范化
- 给所有文件加序号（DCIM 整理）
- 正则替换文件名模式
- 走 atlas-pack 前确保 frame name 一致

### 规则链

可任意组合：

1. **前缀**：在文件名最前加
2. **后缀**：在扩展名之前加
3. **序号**：补零到 1~6 位，可放最前或最后
4. **正则替换**：作用于文件名 stem（不含扩展名），支持捕获组 `$1 $2`

### 实时预览

文件列表显示 `原名 → 新名`：
- 蓝色 = 改名了
- 灰色 = 没变化（规则没影响这个文件）
- 红色删除线 = 冲突（目标名重复或路径已被占用）

**有冲突时不能执行**，必须先解决。

### 两种执行模式

- **原地改名**：直接修改原始文件路径（不可撤销）
- **复制到新目录改名**：原文件保留，复制副本到目标目录改名

### 坑

- 正则用 JS RegExp 语法，flags 默认 `g`。复杂模式建议先在 [regex101](https://regex101.com) 验证。
- 序号是按导入顺序来的，扫描目录时是按文件名字母序加进来的。
- 文件扩展名不会被规则影响（正则只作用于 stem 部分）。

---

## 8. 元数据剥离（Cmd+9）

### 用途

- 对外发图前去掉手机/相机写入的隐私元数据：拍摄设备、GPS、IPTC 版权信息、XMP 编辑历史
- 公开素材网络发布前的标准清理动作
- 批量统一处理整个相册 / 项目目录的元数据

### 典型流程

1. 拖入或扫描目录导入图片（仅支持 JPG / PNG / WebP / GIF）
2. 决定两个保留开关（默认两个都开 → 输出最安全）
3. 选保存路径（原文件夹 / 覆盖原文件 / 自定义文件夹）
4. 点"开始剥离"（或 Cmd+Enter）

### 两个开关

| 开关 | 关掉的后果 | 推荐 |
|------|-----------|------|
| 保留色彩 (ICC profile) | 不同显示器 / 浏览器看可能色彩偏移 | 默认开 |
| 保留方向 (EXIF Orientation) | 手机竖拍 / 横拍的图可能被显示成"倒了"（像素本身没旋转，靠 EXIF 标记） | 默认开 |

不确定就两个都开 — 输出的图肉眼看跟原图一致，只是 EXIF/GPS/IPTC/XMP 这些"隐性数据"被清空。

### 输出格式与质量

按原格式重编码（**不做格式转换**，要转格式去用图片压缩工具）：

- JPG → mozjpeg + quality 95（肉眼几乎无损）
- PNG → 最大压缩级别 9（无损）
- WebP → quality 95
- GIF → libvips 默认 effort 7（无损）

### 坑

- **覆盖原文件模式真的会改原文件**：工具会先写临时文件再 rename，过程崩溃也不会破坏原文件，但成功后原文件就被覆盖了
- **不支持 SVG / BMP / TIFF / HEIC**：受 sharp 写出能力限制，列表会过滤掉
- **不是真的"无损"**：JPG 走 mozjpeg 重编码不可能 bit-perfect，但视觉差通常 < 阈值 5。要 bit-perfect 不可能去掉 EXIF（EXIF 改了 hash 必变）
- **跟图片压缩的区别**：元数据剥离主要是隐私安全，体积顺带减小（一般几百字节 ~ 几 KB）；要大幅减体积请走图片压缩

---

## 9. 九宫格裁切（菜单进入）

### 用途

游戏 / UI 资源**资源压缩** — 美术给的对话框/按钮/面板成品图，中间常常是大片冗余（纯色 / 简单纹理 / 可拉伸图案）。这个工具按 9-slice 切分点把中间整块裁掉，只保留每个区域的最小代表。引擎运行时按元数据反向拉伸回原尺寸，**视觉一致但资源占用大幅缩减**（典型 95~99%）。

### 典型流程

1. 点"选择图片"导入一张 PNG / JPG / WebP
2. 点模板按钮快速起步：**9-slice** / **3-slice 横** / **3-slice 竖**
3. 拖辅助线精调 4 个 inset（或在底部数字输入直接打）
4. 看右侧"还原图"或"Diff"预览，确认还原效果可接受
5. 输出文件名 + 输出目录 → 点"导出小图 + 元数据"

### 4 个 inset 都可以为 0

- **9-slice**（L=T=R=B>0）：圆角对话框 / 按钮 / 面板
- **3-slice 横**（L=R>0, T=B=0）：水平进度条 / 长条按钮
- **3-slice 竖**（T=B>0, L=R=0）：竖直滚动条 / 侧边分隔
- **L-slice**（只一边>0）：左侧有装饰头、右侧无限延伸的标签

### 三个核心数字

| 数字 | 含义 | 用法 |
|------|------|------|
| 输出尺寸 | `L + center_keep.x + R` × `T + center_keep.y + B` | 看裁完是多大 |
| 节省比 | 1 − 输出面积 / 原图面积 | 一般 95% 以上才有意义 |
| **还原误差** | 用裁后小图按 9-slice 拉伸还原，跟原图逐像素 diff 的差异占比 | **关键安全指标**：<1% 安全可裁，1~5% 警告，>5% 不建议 |

### 三种预览模式

| 模式 | 用途 |
|------|------|
| 原图 | 视觉参考，对比用 |
| 还原图 | 用裁后小图模拟运行时拉伸的效果 |
| **Diff** | 红色高亮还原误差超阈值的像素 — 直接看到"哪里不一致" |

### 中心保留 (center keep)

工具给"中心 1px"作为运行时拉伸的代表种子。可调到 2~3px **避免 GPU 双线性采样的边缘 bleeding**。一般 1px 够用。

### 中心策略

`stretch`（默认）或 `tile`。**第一期工具裁切动作两者一致**（都取中心 1px 代表），区别只是**写进元数据给引擎读**。Cocos / Unity / Web 都各有 stretch / tile 配置项。

### 导出产物

| 文件 | 内容 |
|------|------|
| `<name>.png` | 裁后的小图（带透明通道） |
| `<name>.9slice.json` | 元数据：source / cropped 尺寸 + insets + centerKeep + center 策略 |

引擎读 JSON 拿到 4 个 inset → 运行时反向 9-slice 拉伸到任意尺寸。

### 坑

- **中心如果不是纯色 / 不是规则纹理**（中间有装饰、文字、渐变）→ 不能裁。看 Diff 模式如果整片红，就直接放弃用这张图做 9-slice
- **center keep 设太大没意义**：> 4px 就接近原中心，省下来的空间反而被代表种子占走
- **inset 太接近原图尺寸时报错**：L+R 必须 < 原图宽，T+B 必须 < 原图高（否则没有"中心"可压缩）
- **方向键微调**：先在 SVG 编辑区里点一下辅助线让它聚焦（hover 区有蓝色背景提示），再按 ←↑→↓
- **运行时无 9-slice 能力的目标**：原生引擎绝大多数都支持 9-slice，要导给老 Web/Canvas2D 没运行时支持的可以走 atlas-pack 写多种尺寸的成品图

---

## 全局功能

### 主题切换

标题栏右上角 segmented control：**Auto / Light / Dark**
- Auto：跟随系统设置
- Light/Dark：强制覆盖

也可在菜单"视图 → 主题"切换，选择会持久化。

### 设置持久化

下列偏好自动存到 `~/Library/Application Support/SimpleImageCompress/settings.json`：
- 每个工具的输出目录（独立记忆）
- 主题选择

### 快捷键

| 快捷键 | 动作 |
|--------|------|
| `Cmd+1 ~ Cmd+9` | 切到对应工具（菜单"工具" 里 mirror） |
| `Cmd+Enter` | 跑当前工具的主操作（仅在可执行时生效） |
| `Cmd+R` | 重新加载（DevTools 用） |
| `Cmd+Opt+I` | 打开 DevTools |

---

## CLI 模式

GUI 适合一次性操作。**重复 / 批量 / 自动化场景用 CLI** 更合适。

### 安装到 PATH

```bash
# 项目根目录运行一次，把 simpleimage 命令链接到 PATH
npm link

# 之后任意目录可用
simpleimage --help
```

或者每次显式调：
```bash
node /path/to/SimpleImage/bin/cli.cjs <args>
# 或在项目根目录
npm run cli -- <args>
```

### 6 个 subcommand 速查

```bash
# 压缩
simpleimage compress *.png --preset web --output ./out
simpleimage compress photo.jpg --quality 80 --format webp

# 图集打包
simpleimage atlas-pack sprites/*.png --output ./out --format plist --rotate --trim

# 图集拆分
simpleimage atlas-unpack atlas.png atlas.json --output ./extracted

# 图标生成
simpleimage icon-gen logo.png --output ./icons --targets macos-icns,windows-ico,favicon

# 图片对比（不同时退出码 2，方便 CI 用）
simpleimage image-diff before.png after.png --threshold 5 --output diff.png

# 批量重命名（先 --dry-run 看 plan）
simpleimage batch-rename *.jpg --prefix hero_ --seq --seq-digits 3 --dry-run
simpleimage batch-rename *.jpg --prefix hero_ --seq --seq-digits 3
```

### 退出码

- `0` 完全成功
- `1` 参数错误或致命错误（输入文件不存在等）
- `2` 跑完但部分项失败 / image-diff 检测到差异 / batch-rename 有冲突

适合在 shell 里链式：
```bash
simpleimage image-diff golden.png actual.png && echo "✓ 图片一致" || echo "✗ 有差异"
```

### 不支持 CLI 的工具

- **atlas-incremental**：依赖 GUI 的交互预览 + 拆图缓存，CLI 用价值低
- **metadata-strip**：暂未提供 CLI 入口（结构简单，后续可补）
- **nine-slice-crop**：依赖 GUI 的拖拽辅助线 + 实时还原预览，CLI 化价值低
- 如果你真需要，可以 GUI 跑一次，或者直接调用 Node API（`require('.../nine-slice-crop.cjs')` 等）

