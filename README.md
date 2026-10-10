# 朝夕 · Daylight

把日子，轻轻安排好。Make room for your day.

一款免费开源的轻量桌面日历，使用 TypeScript、React 和 Tauri 2 构建。先做好 macOS，再支持 Windows，其他桌面系统随后推进。

## 当前功能

- 常驻 macOS 顶部菜单栏，点击图标查看月历；支持独立窗口，关闭窗口后仍保留菜单栏入口。
- 菜单栏的日历图标内显示当天日期，自动适配深浅背景；运行中的 Mac Dock 日签每天更新，支持深浅主题；日期格保持正方形。
- 月历导航、日期详情、回到今天与键盘操作。
- 轻量本机日程：按日期添加、编辑、删除全天或指定时间的日程和备注；月历显示日程标记，菜单栏和独立窗口共用同一份数据。
- 中国 2025、2026 年官方放假和调休安排；区分休假、调休上班与普通周末。未收录年份明确提示。
- 本地农历、节气、中国节日和可选的国际、文化节日，无需账号或付费日期接口。
- 纯色圆角界面、无滚动条布局，支持主题、字号、周起始日和内容设置。

## 下载与安装

首个公开版本是 **v0.1.0 macOS 预览版**，免费使用。从 [GitHub Releases](https://github.com/kangaroo-demo/Daylight/releases) 下载 Apple Silicon（M1 / M2 / M3 / M4 等）版本。安装包的最低系统设为 macOS 13，当前已在 macOS 26.5 验证；更早的系统尚未逐一验证。Intel Mac 和 Windows 暂无经过验证的下载版本。

打开 DMG，将「朝夕 · Daylight」拖入「应用程序」。此版采用临时签名，**没有 Apple Developer ID 签名或公证**，首次打开可能被系统拦截。具体安装方式、文件校验与本机数据备份见 [INSTALL.md](INSTALL.md)。

暂未实现通知、重复日程、云同步或自动更新。官方休班数据目前收录 2025、2026 年。版本变更见 [CHANGELOG.md](CHANGELOG.md)。

## 本机日程

选中日期后点击月历工具栏的「＋」，或双击日期添加日程。点击底部日程预览可编辑；「全部 N 项」打开当天列表，超过五项时分页查看。键盘支持 `⌘ / Ctrl N` 添加日程，日期获得焦点时按 `Enter` 查看当天列表。

日程保存为应用本机数据目录下的 `personal-events.json`，关闭或重启应用后保留。macOS 路径为 `~/Library/Application Support/app.daylight.calendar/personal-events.json`。不需要账号或联网；卸载前可复制该文件备份。浏览器预览使用该浏览器的本地存储，与桌面应用的数据互相独立。

## 开发

需要 Node.js 24、稳定版 Rust，以及对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。macOS 需要 Xcode 或 Command Line Tools；Windows 需要 Microsoft C++ Build Tools 和 WebView2。

```sh
git clone git@github.com:kangaroo-demo/Daylight.git
cd Daylight
npm ci
npm run tauri -- dev
```

仅预览前端：

```sh
npm run dev
```

打开 <http://127.0.0.1:1420/>。菜单栏、窗口管理等桌面功能需要运行 Tauri 应用。

## 检查与构建

```sh
npm test
npm run build
npm run tauri -- build --bundles app  # macOS 应用
npm run release:mac                  # Apple Silicon Mac 上生成 DMG、ZIP 和 SHA-256 校验文件
```

Mac 产物位于 `src-tauri/target/release/bundle/macos/朝夕 · Daylight.app`，附带界面与日期数据，可离线运行。

发布文件位于 `output/releases/v0.1.0/`。GitHub Actions 在推送 `v*` 标签后运行测试，并从该标签构建 Apple Silicon 安装包、校验打包内容、创建 GitHub Release；`v0.*` 标为预览版。源码、锁文件与三个版本号必须一致，发布失败时不会留下可下载的半成品版本。

更新依赖后，先安装 `cargo-about 0.9.2`，运行 `node scripts/generate-license-notices.mjs` 更新随包分发的许可声明；发布打包时会校验声明对应的锁文件。

重新生成图标可执行 `npm run icons`。图标使用 `scripts/assets/` 中的日签素材；预生成的 PNG 可直接用于跨平台构建，无需生成时的字体环境。运行中的日期由本地时钟更新，隐藏窗口期间也会刷新；安装图标保持固定。

`scripts/inspect-macos.swift` 和 `scripts/verify-macos.swift` 提供原生辅助检查，需要先启动应用并授予辅助功能权限；自动点击场景以 2026 年 10 月为基准，截图保存到 `tmp/native-smoke/`。

## 项目结构

| 路径 | 内容 |
|---|---|
| `src/` | React 界面与样式 |
| `src/domain/` | 共享日期规则、设置和测试 |
| `src/data/` | 年度休班数据、来源与校验记录 |
| `src-tauri/` | Rust 桌面窗口、菜单栏和应用配置 |
| `scripts/` | 开发启动、图标生成和 Mac 检查脚本 |

## 许可与数据

源码使用 [MIT](LICENSE)。农历与节气由 `lunar-javascript` 本地计算，年度休班数据来自 `holiday-cn` 并对照国务院通知核验。第三方许可与数据出处见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `licenses/`。
