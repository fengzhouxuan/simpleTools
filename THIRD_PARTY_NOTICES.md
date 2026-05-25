# Third Party Notices

SimpleImageCompress 本身按 MIT 协议发布（见 [LICENSE](./LICENSE)）。

发布的二进制中包含以下第三方组件，按它们各自的协议使用并在此鸣谢。

## 主要依赖

| 包 | 协议 | 用途 |
|----|------|------|
| [Electron](https://github.com/electron/electron) | MIT | 桌面壳 |
| [Preact](https://github.com/preactjs/preact) | MIT | 渲染层框架 |
| [Vite](https://github.com/vitejs/vite) | MIT | 构建工具 |
| [@preact/preset-vite](https://github.com/preactjs/preset-vite) | MIT | Vite Preact 插件 |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT | 打包工具 |
| [sharp](https://github.com/lovell/sharp) | Apache-2.0 | 图像处理（栅格） |
| [svgo](https://github.com/svg/svgo) | MIT | SVG 优化 |

MIT 与 Apache 2.0 的协议全文可在各自项目仓库中找到。

## libvips（LGPL-3.0-or-later）

sharp 在 macOS 上通过 [`@img/sharp-libvips-darwin-arm64`](https://github.com/lovell/sharp-libvips) 引入 [libvips](https://github.com/libvips/libvips) 的预编译二进制。libvips 按 **LGPL-3.0-or-later** 发布。

- libvips 源代码：<https://github.com/libvips/libvips>
- libvips 协议全文：<https://github.com/libvips/libvips/blob/master/COPYING>
- libvips 在本应用中通过 N-API 动态链接，未做修改。

按 LGPL 第 4 节要求：

1. 本应用使用了未经修改的 libvips。
2. 上述源代码地址可获取 libvips 完整源码。
3. 用户有权用兼容版本的 libvips 替换本应用中分发的版本（替换 `node_modules/@img/sharp-libvips-darwin-arm64` 对应文件即可）。

## 其他

完整传递依赖的协议列表可通过仓库根目录运行以下命令查看：

```bash
npx license-checker --summary
```

或扫描 `node_modules` 中各 `package.json` 的 `license` 字段。
