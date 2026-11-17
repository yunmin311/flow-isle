# 多邮箱、图片、社交提醒与设置页验证（2026-11-16）

这是本轮变更的交付记录。此前报告的测试结论仍属于各自当时版本；不得把用户早前通过的 QQ/163 邮箱测试当作本轮多账号或 QQ 聊天测试。

## 改动与原因

- **多邮箱**：旧版所有账号共用 `FocusIsland/Email`，保存另一个账号会覆盖前一个。这解释了切换 provider 后“已保存”消失，并非每个服务原本各有一份凭据。本轮改为账号与服务器分别绑定的 Windows 凭据，最多 10 个账号独立开关、同时监听。尚存的匹配旧凭据先复制、核验，保留原件；已被旧版覆盖的凭据无法恢复，需要用户在应用内重新录入。不会向聊天索要账号或授权码。
- **身份显示**：邮件记录在主题、发件人下面单独显示收件邮箱，允许换行，阅读页也显示收件账号。读取正文按账号 ID、邮箱身份、收件箱标识、UIDVALIDITY 校验；无法确认的旧记录显示提示，不随意读取另一邮箱的同 UID 邮件。
- **图片**：默认占位，点击“加载图片”后才请求外图及支持的 CID 内嵌图片。外图失败替换为文字占位，不保留破图撑坏布局；正文保留安全文字/表格排版，移除固定宽高和危险样式。远程图片过期、需要网页登录或被拒绝时提供网页邮箱入口。
- **QQ / 微信**：保留 Windows Toast 原文镜像；增加任务栏请求关注的补充提醒与已有客户端唤回。补充提醒只说“有新提醒”，不读取聊天内容；QQ 隐藏窗口通过托盘入口恢复，避免显示 Electron 预加载窗口。没有启用微信进程补丁、聊天数据库读取或辅助功能内存修改。
- **设置**：通知/外观/专注/通用分组；邮箱列表与账号编辑分开，编辑时收起其他通知设置。12px 正文/模块标题、11px 辅助文字；标题靠字重区分。淡分割线、模块留白和更实的玻璃底色，减轻丰富背景干扰。辅助说明用圆形 i 按钮，支持悬停、键盘聚焦、Esc 关闭。重要限制仍常驻显示。
- **通知标题**：“通知记录”与右侧“全部已读/清空”同字体、同 11px 字号，字重 650/400。
- **延迟**：只解析新 Windows 通知的 AppInfo/文本；尝试公开事件订阅，失败时在每次查询完成后等 250ms；启动期间到达的新通知不会作为历史全部丢弃。新外部横幅替换未悬停的旧外部横幅，避免每条排队 5 秒；保留正在悬停的横幅和任务提醒。限长诊断日志只记录时间、耗时、模式，不记录内容、地址或 AUMID。

## 实际参考

1. [Microsoft PowerToys General settings](https://learn.microsoft.com/en-us/windows/powertoys/general)：参考功能分组、操作与解释分级，不复制品牌或字号。
2. [Thunderbird Account Hub](https://support.mozilla.org/en-US/kb/account-hub-thunderbird-desktop) 和 [官方 Account Hub 演示](https://blog.thunderbird.net/files/2025/04/Account-Hub-Community-Hours.pdf)：参考账号列表与单账号配置分开、逐步展开信息。
3. Fly Island **v3.0.8 / `6acdc85bea085ab3023f8e91c742bcb1c709bc9e`（MIT）**：[微信提醒](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src-tauri/src/wechat_reminders/source.rs)、[Shell Hook](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src-tauri/src/win32/shell_hook.rs)、[消息窗口](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src-tauri/src/win32/message_window.rs)、[QQ 唤回](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src-tauri/src/qq_notifications/launcher.rs)。适配本项目；许可已收入 `THIRD_PARTY_NOTICES.md`，随关于页打包。没有使用后来 GPL 版本。

使用 design-method 指导版面，systematic-debugging 定位延迟；浏览器图只作本次实现的可复核证据，视觉是否合意仍由用户判断。

## 为什么原生通知结束后岛上才出现

本机独立 Windows 原生探针实测，先预热两次再创建三条仅本机的合成 Toast：

|步骤|结果|证据|
|---|---|---|
|公开 NotificationChanged 事件订阅|失败，HRESULT 80070490|system-latency-warm.log|
|预热读取列表|8857 / 8961 ms|同上|
|创建三条测试 Toast|各 3 ms|同上|
|GetNotificationsAsync 返回|9839 / 9243 / 9947 ms|同上|
|找到测试通知（含解析）|10416 / 9958 / 10638 ms|同上|

**不是首次读取独有的开销。** 这证明本机主要延迟已经发生在 Windows 通知列表接口中；250ms 是两次已完成查询之间的等待，不是承诺 250ms 送达。应用内重复解析和横幅排队已修，但本机约 9–10 秒的接口延迟尚未解决。探针中 dismissed 时间包含主动清理，不能拿它当作原生 Toast 自然消失时刻。

[微软通知监听说明](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener) 与 [UserNotificationListener API](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener) 是所用公开接口。[WindowsAppSDK issue 6172](https://github.com/microsoft/WindowsAppSDK/issues/6172) 也报告免安装应用订阅事件失败；这与本机 HRESULT 一致，但没有据此假定所有 Windows 安装都失败。没有改用未公开的 WNF 通知机制。

任务栏补充提醒不依赖上述列表查询，代码合并闪烁 2 秒、按应用限制重复；但本轮只验证本机 Shell Hook 注册和窗口生命周期，**尚无真实 QQ/微信聊天触发到点击唤回的完整证据**。[Shell Hook 官方文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registershellhookwindow) 提示该接口不面向通用用途且未来可能变更，因此保留系统 Toast 通道，不能承诺所有客户端版本都支持。

没有实现全局屏蔽其他应用 Toast，没有更改系统勿扰设置。界面保留“只能静默本应用，不能屏蔽其他应用的系统 Toast”与 Windows 专注助手入口。本轮专注静默暂停岛内提示，通知中心仍保留记录。

## 文件列表

|文件|变更|
|---|---|
|src-tauri/src/email_credentials.rs|新增按账号隔离的凭据、旧凭据迁移与清除测试|
|src-tauri/src/lib.rs|多账号监听与正文定位、CID 数据返回、系统镜像延迟、社交模块接入|
|src-tauri/src/email_imap.rs|受限 CID 图片部分选择、读取、签名校验与测试|
|src-tauri/src/social_notifications.rs、social_window.rs|任务栏提醒与 QQ/微信已有实例唤回|
|src-tauri/Cargo.toml|给现有 windows crate 增加 LibraryLoader feature；无新增依赖|
|src/composables/useSettings.ts、useNotifications.ts|设置迁移、写入串行、收件身份保存、社交来源过滤|
|src/panel/EmailAccounts.vue、HintTip.vue|新增账号列表/编辑与可聚焦提示组件|
|src/panel/SettingsPage.vue、NotificationsPage.vue、EmailReader.vue|分组布局、邮箱身份、图片与错误处理|
|src/utils/mailHtml.ts、src/styles.css|安全正文样式、图片降级、目标页面排版|
|src/components/Island.vue|外部通知及时替换、重复抑制、分段耗时|
|scripts/test-settings-accounts.mjs、test-email-reader.mjs、test-notification-peek.mjs|可复现组件/横幅回归|
|.github/workflows/imap-replay.yml|无真实账号的协议/凭据/历史/横幅测试；未提交、未声称远端 CI 已执行|
|THIRD_PARTY_NOTICES.md、本文、此前报告顶部指引|来源署名与证据|

## 测试矩阵

时间为北京时间。所有截图使用合成邮件/账号，不是实际账号画面。

|provider / 环境|测试项|结果|证据|
|---|---|---|---|
|Windows 原生 / 真实凭据 API|两个隔离凭据写入/读取；清除一个保留另一个；旧凭据复制核验；错服务器拒绝；清除后不复活|通过，3 项|native-tests.log；隔离 `FlowIsle/Test` 键，结束清理，未删除用户凭据|
|Windows 原生 / 协议夹具|ID、MIME、provider host、错误文案、畸形响应、IDLE/轮询、历史补录、正文及 CID 选择/大小/签名|通过，16 项|native-tests.log；夹具回放，不是线上账号；未知响应返回错误|
|Windows 原生 / 社交模块|精确进程名筛选、Shell Hook 注册/隐藏窗口/注销|通过，2 项|native-tests.log；合计 21/21，不代表真实聊天已收到|
|Gmail / 实际 TLS IMAP|连接并读最近三封正文|通过 3/3|real-mail.log，2026-11-16 12:32:21；连接 3069ms，正文 1623/1337/1706ms|
|Gmail / 同上|读取前后未读状态|未变化|real-mail.log，unread_unchanged=true；3 封中没有 CID 图片，不能证明线上 CID 正例|
|QQ / 163|本轮双账号同时收信、重启、授权码错误/过期、正文/图像|未验证|用户早前报告连接/收信通过；现有配置仅 Gmail，旧授权码被覆盖无法恢复。本轮未重新录入或代发测试邮件|
|126 / Outlook / custom|本轮真实连接/收信/图片、自定义 host 与真实 TLS 失败|未验证|无可用测试账号；学校 Microsoft 365 通常需 OAuth2，当前未实现|
|实际 Vue + 模拟 IPC|单账号迁移、添加第二账号保留第一、各自状态/开关、清除第一不影响第二、设置落盘不含授权码、独立编辑|通过|settings-browser.log；真实 Windows 凭据单独测试，不把模拟 IPC 当成端到端|
|实际 Vue + Chromium|320/420 浅深色/复杂背景；提示悬停/聚焦/Esc/边界；分类导航|通过自动检查并保存截图|settings-browser.log、settings-*.png；原生玻璃与用户视觉验收另计|
|实际 Vue + Chromium|收件身份、正文、默认阻止外图、允许后 CID 显示、远图失败占位、无脚本注入、列表返回位置/焦点、过期请求丢弃|通过|reader-browser.log、reader-*.png、notifications-list.png|
|实际 Vue + Chromium|“通知记录”与操作字号相等、标题字重更高|通过|reader-browser.log 的 computed style 断言|
|实际通知存储 + 模拟事件|离线历史入库排序、重复/已读保持、持久化、历史不弹横幅|通过|history.log；不是实体关机收信测试|
|实际 Island 函数 + 可控时钟|新外部横幅无 5 秒排队、去重、悬停保护、任务优先、面板打开不弹、专注静默|通过|peek.log；不是 Windows 传输时延测试|
|Windows 原生合成 Toast|事件订阅、预热后 API 时延|已测，存在系统延迟|system-latency-warm.log；上表给出实测值|
|构建|vite:build、Windows target cargo check、tauri build --no-bundle|见下方最终构建记录|vite-build.log、cargo-check.log、tauri-build.log|
|类型检查|vue-tsc --noEmit|未通过：保持已有 4 错误，无新增|types.log：useTimer.ts:69 两项 TS2362；PanelApp.vue:193/259 两项 TS6133|
|Windows GUI|真实页面点击、QQ/微信触发/唤回、原生玻璃视觉|未验证|computer-use 在 sandboxCwd 路径解析报错，工具不能执行；不把浏览器截图替代实际桌面验收|

## 复现与限制

1. 桌面“专注岛” → 设置 → 通知 → 添加邮箱。分别添加 QQ、163；保存后回到列表，各自应显示独立状态/开关。凭据只输入应用；已覆盖的旧码需重新录入。清除操作只作用于明确选中的账号。
2. 从通知中心打开邮件，列表和阅读页都有收件邮箱；旧记录无法安全确定时不编造地址。点击加载图片后，支持的 CID 与外图按需显示，失败显示占位和网页入口。
3. QQ/微信保持登录，打开提醒开关。在其他设备收到消息、桌面客户端请求任务栏关注时应出现补充提醒。点击打开应用；失败明确提示并保留记录。聊天原文取决于客户端是否发出 Windows Toast；不支持直接跳到特定聊天会话。
4. 普通系统通知的时延记录位于应用数据 `focus-island/notification-timing.log`，有检测、前端接收、横幅排队三个阶段，只记录时间，不含通知内容。焦点静默或 panel 已打开时没有 peek 属于设置行为。
5. 运行 `npm run vite:dev` 后，用外部 Playwright 路径运行两个组件测试；`node scripts/test-email-history.mjs`、`node scripts/test-notification-peek.mjs` 无浏览器即可运行。Windows 原生测试采用 WSL 交叉编译当前模块、在 Windows 执行；探针源文件随证据保存。
6. 图片最多 8 个、单个编码后 512KiB、总计 2MiB，支持 PNG/JPEG/GIF/WebP；不支持 SVG、附件管理、发送或回复。邮件不是完整网页复刻；登录态受保护图片仍需去网页邮箱。正文最大 512KiB。
7. 多账号上限 10；改账号身份保留旧凭据，清除须明确操作。Outlook OAuth2 未完成，登录 Outlook 客户端不会自动授权 FlowIsle。
8. 未实测多账号真实并发、QQ/微信完整链路、Windows 10、打包身份安装版事件订阅；没有声称系统级屏蔽或即时通知已完成。短信仍只是 Phone Link 桥接建议，未实现。

## 最终构建与部署

- **构建完成：2026-11-16 17:19:10 +08:00**；`npm run vite:build`、Windows target `cargo check`、`npx tauri build --no-bundle --target x86_64-pc-windows-msvc` 全部通过。遵循项目约束在 WSL 构建 Windows 目标。
- **桌面快捷方式启动：17:19:55 +08:00**，`专注岛.lnk` 的目标与新 exe 一致，运行进程路径一致且有非零窗口句柄；随后进程存活见 postcheck.log。
- 产物：`E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，**13,303,296 字节**；版本仍为 2.10.0，以时间和 hash 区分。
- SHA256：`6d8c22dd1d4dde7cda135e3ac2273f78f61ba31c62226e14ad41a60799aef55f`。
- 覆盖前备份：`/home/lqy/.cache/flowisle-deploy/focus-island-before-multi-mail-20261116-1719.exe`。没有回退工作区、重置用户设置或清除用户凭据。
- 部署后：Gmail 于 17:20:01 恢复 IDLE，17:20:03 历史通知补入，见 email-restart.log。实际通知文件 200 条、200 个唯一 ID；37 条邮件中 36 条带收件身份，另 1 条旧记录不猜地址，见 runtime-store.json。此为本次快照，不是所有历史记录都能恢复的保证。
- **部署版三条合成系统通知**：检测时邮件无关的通知年龄分别 **11032 / 16140 / 15263 ms**，前端接收 **11033 / 16141 / 15264 ms**，横幅排队均 **0 ms**，见 notification-timing.log。本测试同时运行独立探针查询列表，可能增加系统查询负载；不能把这些数值推广到所有机器，也不能称为即时送达已修复。可确认本轮岛内没有再等 5 秒。
- 三条本机合成测试通知可在通知中心看到，标题以“FlowIsle 通知延迟测试”开头；没有发真实聊天或邮件。探针只移除自己的临时注册和自己的原生 Toast。
- [证据目录](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-multi-mail-20261116) 保存完整日志、测试探针源文件、截图、源码 hash；[本地截图预览](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-multi-mail-20261116/preview.html)。
