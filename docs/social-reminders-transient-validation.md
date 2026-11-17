# QQ / 微信只提醒、不记录（2026-11-16）

## 行为

- QQ、微信的 Windows 通知和任务栏补充提醒只显示岛内横幅，无论有没有聊天预览，都不新增通知中心记录，不增加未读数。
- 旧 QQ/微信提醒从面板列表和未读数中隐藏；不直接删除已有数据文件中的旧条目。
- 点击仍打开客户端。打开失败则在岛内显示“无法打开…请从系统托盘打开应用，或点击重试”，不跳转到不存在的记录。
- QQ 邮箱走邮件通道，不受影响；其他系统通知、邮件、任务提醒继续保存。设置提示文字已说明“仅弹出提醒，不保存到通知中心”。

## 文件

`src/utils/notificationSources.ts`（精确来源识别），`src/composables/useNotifications.ts`（不入库、隐藏旧条目），`src/components/Island.vue`（临时错误提示），`src/panel/SettingsPage.vue`（说明文字），`scripts/test-email-history.mjs`、`scripts/test-notification-peek.mjs`（回归）。未调整视觉布局，无新依赖。

## 测试

|检查|结果|证据|
|---|---|---|
|QQ / 微信 / WeChat / Weixin，两个任务栏来源标识，均带合成预览内容|通过：不写入记录、不增加未读|history.log|
|已有 QQ/微信记录，混合 QQ 邮件和“QQ邮箱”系统来源|通过：只隐藏聊天提醒；保留邮箱；旧数据未直接删除|history.log|
|新聊天提醒、点击来源、打开失败|通过：仍弹提醒并激活；失败明确提示且不打开面板|peek.log|
|原有历史补收、去重、专注静默、横幅队列|回归通过|history.log、peek.log|
|Windows target cargo check|通过|cargo-check.log|
|前端与 release 构建、类型检查、快捷方式启动|见部署记录|build.log、types.log、launch.log|

测试使用真实通知存储模块和 Island 函数，文件/事件/Windows 激活调用用测试替身；不是本轮真实 QQ/微信聊天端到端证据。复现：`node scripts/test-email-history.mjs`、`node scripts/test-notification-peek.mjs`。

## 部署

- 构建时间：2026-11-16T23:19:20.008242+08:00；产物 `E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，13309952 字节，版本仍为 2.10.0。
- SHA256：`935c1b217af43fdccb469ae8d2928d81dc1499b0ee53b5e3ae60aeee04e8dc22`。
- `npm run vite:build`（Tauri beforeBuildCommand）、Windows target `cargo check`、`npx tauri build --no-bundle --target x86_64-pc-windows-msvc` 均通过；WSL 构建，无新依赖。
- `vue-tsc --noEmit` 仍为原有 4 处错误（useTimer.ts:69 两处，PanelApp.vue:193/259），无新增。
- 桌面“专注岛”快捷方式已启动本轮产物；`launch.log` 核对目标、SHA256、运行进程路径、启动时间和非零窗口句柄。
- 旧 exe 备份：`/home/lqy/.cache/flowisle-deploy/focus-island-before-social-transient-20261116-2319.exe`。
- [测试日志与构建证据](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-social-transient-20261116)。本轮未重新进行真实 QQ/微信聊天触发；自动测试用合成通知覆盖入库、弹窗与点击行为，无需用户提供聊天内容。
