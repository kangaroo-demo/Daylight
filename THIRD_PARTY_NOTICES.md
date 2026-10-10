# 第三方软件与日期资料

朝夕源码采用 MIT。第三方软件保留各自许可，许可文本随源码及应用保存于 `licenses/`；Cargo 与 npm 锁文件固定当前构建依赖。首个 Apple Silicon 发行版的 Rust 依赖（含构建依赖）声明见 `licenses/RUST_DEPENDENCIES.txt`，前端运行依赖声明见 `licenses/NPM_DEPENDENCIES.txt`。以下列出主要直接依赖与日期资料。

| 项目 | 用途 | 许可 / 出处 |
|---|---|---|
| [lunar-javascript](https://github.com/6tail/lunar-javascript) | 本地农历与节气计算 | MIT，Copyright (c) 2018 6tail |
| [holiday-cn](https://github.com/NateScarlet/holiday-cn) | 2025、2026 休班 JSON | MIT，Copyright (c) 2019 NateScarlet |
| [React / React DOM](https://github.com/facebook/react) | 界面 | MIT |
| [Tauri](https://github.com/tauri-apps/tauri) | 桌面窗口与托盘 | MIT / Apache-2.0 |
| [objc2 AppKit / Foundation](https://github.com/madsmtm/objc2) | macOS 原生菜单焦点判断 | MIT；AppKit 也可选 Zlib / Apache-2.0，采用 MIT |
| [Lucide](https://lucide.dev/license) | 控件图标与开发期应用图标 | ISC；Feather 来源部分为 MIT，已保存完整声明 |

日期的核验资料：

- [国务院 2025 年放假通知](https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm)及 [2026 年放假通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)。它们是休班事实的依据，开源项目是整理后的分发格式。
- [香港天文台公历与农历日期对照表](https://www.hko.gov.hk/en/gts/time/conversion.htm)：核对农历边界和 UTC+8 的 24 节气日期。未将历表全文作为产品数据重新分发。
- [联合国国际纪念日](https://www.un.org/en/observances/list-days-weeks)：精选纪念日的名称与日期依据，产品不复制机构图片、徽标或文章。
- 母亲节采用五月第二个星期日；父亲节采用六月第三个星期日。这是当前文化节日包的范围，不表示全球各地区规则一致。

运行时只读取随应用提供的数据并在本地计算日期，不调用付费接口。首版不具备联网下载年度数据的更新功能。未来加入新年度资料时，应验证来源、数据结构、校验值与全部年度休班，并保留旧的有效版本。
