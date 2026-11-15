# 邮件补收与漏信修复：已部署（2026-11-15）

## 改动摘要
- 启动查询 INBOX 最近 7 天（IMAP 按日期）的最新 50 封，包含已读邮件。历史邮件仅进通知中心，不发声、不弹岛内 peek。
- 抓取成功并发出事件后才确认 UID，失败可重试；支持乱序和部分抓取。历史邮件重试仍保持静默。
- IDLE 以 5 秒读等待触发兜底检查；不支持 IDLE 时每 5 秒轮询。临时错误重连等待 2/4/8/30 秒，凭据错误仍等待 120 秒。间隔不等于实际送达时延保证。
- 后端等待前端邮件监听器就绪再开始收信；邮件记录按邮件 Date 时间排序，非法日期回退到接收时间。
- 按 mailbox key + UID 去重并保留已有已读状态。未改变视觉设计，未新增项目依赖，未提交工作区改动。

## 产物与启动证据
- 构建时间（北京时间）：2026-11-15T16:51:57.844209+08:00。
- 部署路径：`E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`。
- SHA256：`cd0ed005862d19057c85816ef4976dccf7959dd85f4ebc6b9689f821e7191315`。
- 版本号仍为 2.10.0；以构建时间和 SHA256 区分本次产物。
- 16:52:39 从桌面 `专注岛.lnk` 启动，核对目标、运行路径、SHA256 和窗口句柄；16:53:12 再次通过同一快捷方式启动。见 launch.log、restart-launch.log。
- 16:54:52 再次核对运行路径与磁盘产物 hash，程序正在运行；见 postcheck.log。
- 原 exe 备份位于 `/home/lqy/.cache/flowisle-deploy/focus-island-before-deploy.exe`。

## 文件列表
- `src-tauri/src/email_imap.rs`：历史查询、游标、IDLE 兜底和回归测试。
- `src-tauri/src/lib.rs`：历史标记、就绪握手、轮询/重连、无邮件内容的状态日志。
- `src/composables/useNotifications.ts`：就绪信号、邮件时间、记录排序。
- `src/components/Island.vue`：历史邮件不弹窗。
- `scripts/test-email-history.mjs`：实际前端源码结合模拟 Tauri 的无账号回归测试。
- `docs/email-history-validation.md`：本报告。

## 测试矩阵
|provider|测试项|结果|证据（北京时间）|
|---|---|---|---|
|通用|npm run vite:build|通过|vite.log，built in 1m 35s；Tauri 构建也重新执行成功|
|通用|cargo check，Windows x64 目标|通过|cargo-check.log，44.78s|
|通用|npx tauri build --no-bundle，Windows x64 目标|通过|tauri-build.log，release 3m 02s；artifact.json|
|通用|类型检查|未通过，仍为既有 4 项|types.log：useTimer.ts 两项，PanelApp.vue 两项|
|163/通用（录制或模拟响应）|ID 过滤、未知/畸形响应、错误分类、MIME、provider host、IDLE/轮询、补收与失败重试、去重|10/10 通过|replay-tests.log；从实际 email_imap.rs 编译 Windows 测试 exe，在 Windows 执行；不是 10 次真实邮箱测试|
|通用（模拟 Tauri）|监听就绪、记录排序、持久化、去重/已读保持、历史静默、实时 peek|通过|history-test.log；node scripts/test-email-history.mjs|
|Gmail（真实账号）|启动监听与历史抓取|通过|live-email-status.log：两次 listening IDLE，每次 50 个 history emitted；16:52、16:53|
|Gmail（真实账号）|历史记录落盘|通过|after-launch-summary.json：新增 33 条此前没有的邮件记录，其日期均早于部署；16:52:49|
|Gmail（真实账号）|重启后继续监听、记录去重|通过|restart-launch.log、restart-dedup.json：重启后同一组 40 条邮件记录、重复 ID 为 0；16:53:29|
|163 / QQ|新版真实实时收信、端到端延迟|未验证|上一版用户确认通过，不作为此次新版延迟测试证据|
|Gmail|新版实时新信延迟、实体关机期间新来信补收|未验证|此次使用已有历史邮件验证补收，未发测试邮件或执行整机关机|
|126 / Outlook / custom|新版真实收信|未验证|本轮没有切换配置或操作账号|

证据目录：`/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-mail-history-deployed-20261115`。只保存构建输出、状态和汇总数量；未保存邮箱地址、授权码、邮件主题/发件人或 AUMID。

## 已知限制与未完成项
- 补收最近 7 天的 INBOX 最多 50 封，不是精确计算关机区间；其它文件夹、更早邮件不补收。
- 通知中心仍有总计 200 条保留上限；较旧记录可能被裁掉。此次总计 200 条，其中邮件 40 条。
- 手动清空通知后，再启动会重新补入窗口内邮件。
- 本轮没有测量 163/QQ/Gmail 的真实新信时延，不能宣称已消除所有慢收或漏收。
- 历史静默/实时 peek 的自动测试通过，但未把截图或人工点击验收作为本轮证据。
- 微信、QQ 社交通知和短信仅给建议，见 social-advice.md；未实现或实测。
- 依赖 imap-proto 0.10.2 有 Rust future-incompatibility 警告；当前构建通过。本轮未升级依赖。

## 用户复现
1. 保持新版运行，在设置选择 163 或 QQ，开启邮件提醒，向该邮箱发新邮件，观察到达及点击跳转。
2. 从托盘退出应用，向邮箱发送另一封邮件，可在手机上先标为已读；重新打开桌面“专注岛”，检查通知中心补入该邮件且没有历史弹窗。
3. 再次退出并启动，确认同一邮件不重复。记录发送时间、邮箱实际收到时间和 FlowIsle 显示时间，便于区分服务商延迟与应用延迟。

## 构建复现
WSL 用户目录已安装 Linux Rust 1.100.0 和 LLVM 18；只读使用本机 Windows SDK/MSVC 链接库，无 Windows cargo/node 构建。

```bash
cd /mnt/e/30_项目/focus-island
source /home/lqy/.cache/flowisle-deploy/env.sh
npm run vite:build
node scripts/test-email-history.mjs
cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
CARGO_NET_OFFLINE=true npx tauri build --no-bundle --target x86_64-pc-windows-msvc
```

Windows 测试 exe 使用隔离测试包直接包含项目实际 email_imap.rs，见 replay-build.log；未改变项目依赖。构建中间文件位于 `/home/lqy/.cache/flowisle-deploy/target`。之前失败/中断的尝试不计入通过项；本报告以本次日志为准。
