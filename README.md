# 朝夕 · Daylight

把日子，轻轻安排好。Make room for your day.

一款免费开源的轻量桌面日历，使用 TypeScript、React 和 Tauri 2 构建。先做好 macOS，再支持 Windows，其他桌面系统随后推进。

## 当前功能

- 常驻 macOS 顶部菜单栏，点击图标查看月历；支持独立窗口，关闭窗口后仍保留菜单栏入口。
- 月历导航、日期详情、回到今天与键盘操作。
- 中国 2025、2026 年官方放假和调休安排；区分休假、调休上班与普通周末。未收录年份明确提示。
- 本地农历、节气、中国节日和可选的国际、文化节日，无需账号或付费日期接口。
- 纯色圆角界面、无滚动条布局，支持主题、字号、周起始日和内容设置。

当前是早期开发版本，已在 macOS 调试，Windows 尚未实机验证。图标与界面仍在调整；Mac 应用尚未签名、公证。暂未实现个人日程、通知或云同步。

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
```

Mac 产物位于 `src-tauri/target/release/bundle/macos/朝夕 · Daylight.app`，附带界面与日期数据，可离线运行。

重新生成当前开发期图标可执行 `npm run icons`。`scripts/inspect-macos.swift` 和 `scripts/verify-macos.swift` 提供原生辅助检查，需要先启动应用并授予辅助功能权限；自动点击场景以 2026 年 10 月为基准，截图保存到 `tmp/native-smoke/`。

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
