# 朝夕 · Daylight 安装说明

## 适用范围

v0.1.0 是免费开源的 macOS 预览版。下载文件名中的 `arm64` 表示 Apple Silicon Mac（M1 / M2 / M3 / M4 等），不能用于 Intel Mac 或 Windows。

安装包的最低系统设为 macOS 13；当前已在 macOS 26.5 实机验证，其他系统版本尚未逐一验证。

## 安装

1. 从 <https://github.com/kangaroo-demo/Daylight/releases/tag/v0.1.0> 下载 `Daylight_0.1.0_macos_arm64.dmg`。
2. 打开 DMG，将「朝夕 · Daylight」拖入「应用程序」，然后推出磁盘映像。
3. 从「应用程序」打开应用。点击顶部菜单栏的日签图标即可展开月历；关闭独立窗口后，菜单栏入口仍会保留。

也可以下载 ZIP，解压后将其中的 `.app` 拖入「应用程序」。请先退出已运行的旧版本，再替换应用。

## 首次打开被 macOS 拦截

此版有用于保持应用包完整性的临时签名，**没有 Apple Developer ID 签名和公证**，macOS 不会将其识别为经过 Apple 验证的开发者应用。

先尝试打开一次，再进入「系统设置 → 隐私与安全性」，找到这次拦截的提示，点击「仍要打开」，按系统提示确认。如果应用未显示在该位置，请先核对下载来源与 SHA-256 校验值，或提交问题；无需关闭系统安全功能。

## 校验下载文件

下载同一版本的 `SHA256SUMS.txt`，在终端进入下载目录，执行：

```sh
shasum -a 256 Daylight_0.1.0_macos_arm64.dmg
```

将输出与 `SHA256SUMS.txt` 中同名文件的一行对照。ZIP 也可以用同样方法校验。

## 本机日程与退出

日程保存在：

```text
~/Library/Application Support/app.daylight.calendar/personal-events.json
```

应用运行时无需账号或联网。退出应用后复制这个文件即可备份；替换应用本身不会删除日程。此版暂时没有导入导出界面或云同步。

右键点击菜单栏图标，在菜单中选择「退出朝夕」。卸载前如需保留日程，请先备份；删除 `.app` 不会自动清除上面的数据目录。

## 当前限制与反馈

- 官方放假、调休数据收录 2025、2026 年，其他年份会提示未收录。
- 尚无通知提醒、重复日程、云同步或自动更新。
- Intel Mac、Windows 及其他桌面系统等待后续构建与验证。

问题反馈：<https://github.com/kangaroo-demo/Daylight/issues>。请提供应用版本、macOS 版本、处理器类型和复现步骤，截图前隐藏私人日程。
