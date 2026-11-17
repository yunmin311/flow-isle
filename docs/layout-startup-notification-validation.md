# 邮件排版、设置密度、启动补收与通知延迟（2026-11-16）

本报告只记录本轮执行的检查。上一轮真实账号和 Windows 凭据检查见 `multi-mail-social-settings-validation.md`；不把过去的通过当成本轮通过。

## 本轮改动

- 邮件排版表格和数据表格分别处理：通讯邮件的嵌套排版可换行，不再逐层增加格线/边距；真正的数据表格在自己的区域横向滚动。图片占位缩短为“图片未加载”，保持可读宽度，失败也不挤成竖条。默认阻止远图、用户主动加载及安全过滤仍保留。
- 设置沿用当前分类、12px 正文/11px 辅助文字和淡边界。收紧组间、组内距离；标签与控件对齐。普通说明挂在文字上，悬停/键盘聚焦可看；玻璃效果、通知权限等解释保留提示图标。没有重画 TODO/备忘。
- 启动补入的新邮件合并显示“已补收 N 封邮件”，点击打开通知中心并定位最新补收记录。1.5 秒内连续到达的记录合并；慢账号在后面到达时可能再有一条汇总。已有记录重放不再提示，清空记录取消待发汇总，专注静默仍生效。汇总不播放声音。
- 邮件、系统通知、专注/任务提醒各自最多 200 条，避免系统通知挤掉邮件。邮件/专注记录保留 30 天，系统记录 7 天。后端首次同步仍只查最近 7 天、每账号最多最近 50 封；本轮没有扩大同步窗口。
- 后端等待 main 和 panel 都注册邮件监听后再启动同步，避免只等面板就开始补录。
- Windows Toast 正文读取标题后的全部文本行，避免丢掉第三行等预览内容。日志新增查询/解析分段耗时及事件订阅错误码，只记时间/状态，不写内容、邮箱或来源标识。

## 证据与测试矩阵

全部时间为北京时间；浏览器截图使用合成邮件和邮箱，不是用户私信。

|环境 / 测试项|结果|证据文件|
|---|---|---|
|复杂邮件修复前，320px|复现失败：图片说明宽约 31px、高 195–301px|`before/reader-test.log`、`before/reader-complex-320.png`|
|实际 Vue 邮件阅读器，320/420px|通过：6 个图片占位均可读、无整页横向溢出，8 列数据表局部滚动|`reader-browser.log`、`reader-complex-*.png`|
|安全、远图默认拦截、主动加载 CID、图片失败降级、返回列表位置/焦点、过期请求、纯文本|通过实际 Vue + Chromium；Tauri 调用为测试替身|`reader-browser.log`、`reader-*.png`|
|实际设置组件，320/420px、浅深色、复杂背景|通过：控件中心与标签误差不超过 1px；普通文字提示无 i，解释性提示保留 i；双账号独立操作回归通过|`settings-browser.log`、`settings-*.png`；凭据调用为测试替身|
|真实通知存储模块 + 模拟文件/事件|通过：历史时间/持久化、去重/已读保持、两邮箱合并、重启重放静默、新漏收汇总、210 条系统通知不挤掉邮件、清空取消汇总、专注静默|`history.log`；不是实体关机收信证据|
|实际 Island 队列函数 + 可控时钟|通过：即时替换、去重、悬停保护、任务优先、面板打开不弹、专注静默|`peek.log`；不代表 Windows 传输即时|
|本机 Windows，关闭 FlowIsle 后单独查询|已测：MTA 两次 5865/5629ms；STA 两次 5676/5804ms；均 71 条通知|`system-query.log`，22:17:13 开始|
|公开 NotificationChanged 事件订阅|失败：两种线程模式均 HRESULT 80070490|`system-query.log`；不能宣称已获得实时事件|
|真实 Gmail / 新版启动补录|通过：邮件记录由 16 增至 50，补回 34 条；235 条记录 ID 全部唯一|`runtime-store.json`、`email-status.log`；证明实际启动补录，不等于物理关机收信测试或原生汇总横幅目视验收|
|Windows 三行合成 Toast → 新版通知中心|通过：标题后两行正文完整保存；检测 8281ms，查询 5557ms、单条解析 13ms、前端收到 8283ms、横幅排队 0ms|`native-toast.log`、`runtime-store.json`、`notification-timing.log`；发送程序不查询通知，无双查询负载|
|构建/类型/新版本启动|见下方最终部署记录|`release-build.log`、`cargo-check.log`、`types.log`、`launch.log`|
|真实 QQ/微信聊天、实体关机期间新邮件、Windows 10、原生玻璃与视觉验收|未验证|没有用模拟测试代替这些结果|

## 系统通知：能做什么、还有什么没解决

本机已有记录说明接收前发生长延迟，前端显示排队为 0ms。本轮独立线程对照排除了“改成 STA 就会快”的猜测；不能把两次查询之间等 250ms 说成 250ms 送达。没有删除用户的 Windows 通知记录来制造变快，也没有启用未公开通知数据库/WNF 协议。

QQ/微信若发出 Windows Toast，FlowIsle 可以展示 Windows 提供的预览文字，包括多行正文。客户端隐去内容时只能看到其给出的文字；任务栏闪烁补充通道只知道应用请求关注，拿不到聊天正文。没有读取聊天数据库、注入客户端或承诺直达特定聊天会话。真实 QQ/微信端到端内容读取与时延仍需后续实测。

**系统级屏蔽没有实现。** [微软通知监听说明](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener) 的能力是读取通知和管理通知中心已有记录，移除已出现通知不等于拦截 Toast；访问需要用户授权，官方应用模型还要求相应清单能力。当前免安装版本读列表可用、事件订阅失败，不据此推断打包版本的表现。

[FocusSessionManager.TryStartFocusSession](https://learn.microsoft.com/en-us/uwp/api/windows.ui.shell.focussessionmanager.trystartfocussession?view=winrt-28000) 属于需微软解锁令牌的受限功能，不能当作普通第三方应用随意切换系统勿扰的稳定方案。注册表改写、未公开 Shell 消息本轮没有执行，不能列为验证通过。

现有设置 → 通知 → Windows 专注助手入口可以打开系统设置；由用户选择勿扰/专注助手的规则和例外。FlowIsle 的“专注时静默”只停本应用岛内提示，通知中心保留记录；不能屏蔽其他应用的系统 Toast。没有改动用户勿扰设置，因此无系统状态需要恢复。

## 后续想法：在岛上审批 Agent 操作（尚未实现）

可行方向是逐个接入 Agent 官方提供的审批接口，而不是模拟任意窗口的“同意”按钮。先做一个支持审批请求/结果回传的 Agent：卡片显示来源、项目、将执行的操作及必要参数；提供“一次同意 / 拒绝 / 查看详情”。每个按钮绑定唯一请求、原会话、超时和单次消耗状态；请求变更、重连或会话结束后旧按钮失效。危险操作必须展开真实内容，不能只显示模糊标题；不默认提供“以后都同意”。点击后等 Agent 确认收到，再显示完成。

本轮仅记录此开发方向，没有接通任何 Agent、发送审批或改变其权限策略。没有审批接口的 Agent 只能提醒并打开原窗口，不应声称能直接代批。

## 文件列表（本轮）

|文件|改动|
|---|---|
|`src/utils/mailHtml.ts`、`src/panel/EmailReader.vue`|排版表格分类、窄屏重排、数据局部滚动、短图片占位|
|`src/panel/HintTip.vue`、`src/panel/SettingsPage.vue`、`src/styles.css`|文字提示与图标取舍、对齐、间距|
|`src/composables/useNotifications.ts`|分来源留存、补收去重汇总、清空取消|
|`src/components/Island.vue`、`src/components/SystemPeekBanner.vue`|补收横幅、点击定位、main 监听就绪|
|`src-tauri/src/lib.rs`|双窗口就绪、多行 Toast 正文、耗时诊断|
|`scripts/test-email-reader.mjs`、`scripts/test-settings-accounts.mjs`、`scripts/test-email-history.mjs`|相应回归测试|
|本文|证据、未完成项、审批功能建议|

本轮设计依据是用户给出的 FlowIsle 截图和已接受分类；未新增外部设计来源。此前参考的 PowerToys General、Thunderbird Account Hub 和 Fly Island MIT 版本已在上一轮报告逐项列出，本轮没有冒称重新研究或照搬新项目。无新增依赖，未修改账号配置、授权码或凭据。

## 复现

1. 桌面“专注岛”打开新版；设置各分类检查紧凑度，悬停普通标签与少量 i，检查控件对齐。
2. 通知中心打开多层通讯邮件；窄面板中图片说明应水平可读；数据表可局部横向滚动；加载失败有短占位和网页邮箱入口。
3. 保持邮箱提醒开启，退出 FlowIsle（或关机），让邮箱收到新邮件；重启后等待服务器连接与同步。通知中心补入原邮件时间，岛上按批汇总；再重启已有记录不重复提醒。最近 7 天/50 封的同步边界仍适用。面板已打开或专注静默时，不弹横幅是既有设置行为。
4. `node scripts/test-email-history.mjs` 与 `node scripts/test-notification-peek.mjs` 可直接运行。启动 `npm run vite:dev`，设置 `PLAYWRIGHT_MODULE` 指向已有外部 Playwright，运行两个浏览器测试脚本。具体命令和日志在证据目录。
5. Windows 通知耗时在应用数据的 `focus-island/notification-timing.log`；`query_ms` 是 Windows 列表查询耗时，`parse_ms` 是单条解析耗时，`received` 是通知从创建至前端收到的总时长，`peek` 是前端横幅等待时长。

## 最终构建与部署

- **构建：2026-11-16 22:19:21 +08:00**，Windows release exe 13,309,952 字节，版本仍为 2.10.0。`npm run vite:build`（由 Tauri beforeBuildCommand 调用）、Windows target `cargo check`、`npx tauri build --no-bundle --target x86_64-pc-windows-msvc` 均通过；使用 WSL 构建。
- **桌面快捷方式启动：22:21:08**。`专注岛.lnk` 目标和实际运行进程均为 `E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，窗口句柄非零；22:23:12 再查进程仍存活。
- SHA256：`41c4c3cd57e20c03705b5be15617be77c784c7064040210ef91b9a990dbc5d68`。覆盖前 exe 备份在 `/home/lqy/.cache/flowisle-deploy/focus-island-before-layout-20261116-2220.exe`。
- Gmail 22:21:13 恢复 IDLE，22:21:16 发出历史记录，22:22:27 安全计数确认补回 34 条邮件；没有输出邮件标题、地址、授权码或来源应用标识。旧记录因总上限丢失后的补回也包含在这 34 条中，不能说它们全是在本次停机期间新到的邮件。
- 类型检查**未通过**，仍为此前 4 处错误：`useTimer.ts:69` 两处 TS2362，`PanelApp.vue:193/259` 两处 TS6133。本轮无新增错误。Rust 提示现有 `imap-proto 0.10.2` 的未来兼容警告。
- 浏览器和模拟存储测试通过；原生邮件补录、原生多行 Toast 保存和快捷方式启动有实测。实体关机期间新到邮件、原生补收横幅点击与真实 QQ/微信聊天链路仍未验证。computer-use 在本轮返回 sandboxCwd 路径解析错误，无法完成原生 GUI 自动操作；没有用浏览器图冒充桌面图。
- **未完成：Windows 系统通知延迟**。部署版单次合成通知仍用了 8.3 秒到前端，未发现可靠的免安装公开事件替代路径；未声称已解决或实现系统级拦截。Agent 审批仅为开发建议。

[本轮证据目录](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-layout-fix-20261116) · [本地前后对照](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-layout-fix-20261116/preview.html)。`source-hashes.txt` 记录测试/构建对应源码；没有提交、回退或清理工作区。
