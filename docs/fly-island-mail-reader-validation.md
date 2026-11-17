# Fly Island 参考移植与邮件阅读验证（2026-11-16）

> 后续更新：多账号、CID 图片、QQ/微信补充提醒与设置页已继续修改；请以 [2026-11-16 本轮验证](multi-mail-social-settings-validation.md) 判断当前状态。本文保留早前版本的历史证据。

## 本次交付范围

已把通知中心的邮件记录改为独立阅读页：点击记录读取正文，返回时保留列表滚动位置与键盘焦点；主题、发件人、时间和正文分层展示；支持加载状态、失败重试和已知 provider 的网页邮箱入口。沿用 FlowIsle 的主题、字体体系和双窗口导航，不重做其他页面。岛内邮件 peek 仍按此前验收的行为打开对应网页邮箱。

正文通过原有 TLS IMAP 模块按需读取，使用 EXAMINE + UID BODY.PEEK，跳过附件，最多读取 512 KiB 编码后文字部分；支持 Base64、Quoted-Printable、UTF-8、GB18030 等已有字符集解码。核对邮箱身份和 UIDVALIDITY，避免读到其他邮箱/重建收件箱中的同 UID 邮件。正文仅在阅读页内存中，返回或离开通知页清除。并发读取限制为一封，快速切换时可能提示稍后重试。

HTML 只保留安全的文字、表格、列表与 HTTP(S) 链接，去掉脚本、表单、嵌入页面和邮件自带 CSS。外部图片默认不加载，需手动允许；因此不是原网页邮件的像素级复现。正文内链接由默认浏览器打开。

## 上游来源与取舍

核实项目为 [flyl1u/fly-island](https://github.com/flyl1u/fly-island)。本次参考、移植固定在 **v3.0.8 / `6acdc85bea085ab3023f8e91c742bcb1c709bc9e`**，其 [LICENSE](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/LICENSE) 为 MIT。查询时 main 为 `d90ecf382f3f4897458f82fa85a194197b6dc27e`，已改 GPL；没有从其 GPL 版本引入代码。

- [MailPanel.tsx](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src/features/messages/mail/MailPanel.tsx)、MailPanel.css、useMailReader.ts：借用阅读导航、请求过期处理和 HTML 允许列表，适配为 Vue 与 FlowIsle 主题。
- [mail/content.rs](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/src-tauri/src/mail/content.rs)：适配非附件文字部分选择、大小限制及 QQ 不使用部分正文请求的处理。
- 完整署名和 MIT 许可在根目录 `THIRD_PARTY_NOTICES.md`，并通过“设置 → 关于 → 第三方开源许可”随前端嵌入 exe。没有新增项目依赖。

### QQ、微信、短信

|来源|核实的上游机制|本次 FlowIsle 状态与建议|
|---|---|---|
|QQ|UserNotificationListener 读取 Windows Toast；其打开 QQ 的代码通过客户端托盘入口恢复已登录实例，避免强行显示隐藏预加载窗口；另有通知注册修复脚本|FlowIsle 已有通用 Windows 通知镜像，接收原理相同。这次未移植 QQ 专用托盘唤回/注册修复，也未验证本机 QQ 聊天收信；此前通过的是 QQ **邮箱**，不能混为一谈。下一步应先用真实 QQ 消息定位接收或唤回的实际缺口|
|微信普通提醒|RegisterShellHookWindow / HSHELL_FLASH，按进程路径过滤、去重；只能说明微信请求关注，不提供聊天正文|可作为后续较保守方案，但此轮没有移植/启用，也没有本机真实微信提醒证据；微软将此接口标为非通用、未来可能变更|
|微信摘要|UI Automation 读取会话列表；部分微信 4.x 需要临时改 Weixin.dll 进程内的 Qt 辅助功能标志；上游默认关闭并提示风险|没有引入或启用进程内存修改，也没有宣称支持联系人/消息正文。摘要与普通提醒是两种能力|
|短信（仅建议）|微软 Phone Link 可在配对并授权后同步手机消息|建议先验证“手机连接”产生的 Windows 通知能否由现有镜像读取。这是候选方案，不是已实现的直接短信 API；本轮未配对手机、未读取短信|

证据：[上游 QQ 说明](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/docs/qq-notification-compatibility.md)、[微信说明](https://github.com/flyl1u/fly-island/blob/6acdc85bea085ab3023f8e91c742bcb1c709bc9e/docs/wechat-reminder-compatibility.md)、[微软 Shell Hook 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registershellhookwindow)、[Phone Link 消息配置](https://support.microsoft.com/en-us/windows/apps/phonelink/setting-up-messages-in-the-phone-link)。上游文档中的“本机通过”是作者自己的测试，不能作为 FlowIsle 的测试结果。

## 文件列表

- `src-tauri/src/email_imap.rs`：受限 BODYSTRUCTURE / BODY section 解析、文字部分选择和解码，新增 5 项回放/单元测试。
- `src-tauri/src/lib.rs`：panel 专用 `read_email_body`，邮箱身份核对、并发限制、无敏感内容的诊断。
- `src/panel/EmailReader.vue`：阅读页、重试、安全外链和过期请求防护。
- `src/utils/mailHtml.ts`：独立 DOMPurify 实例，不影响备忘编辑器的过滤器。
- `src/panel/NotificationsPage.vue`：邮件列表进入阅读页、返回原位置、离开页面清空正文。
- `src/panel/AboutDialog.vue`、`THIRD_PARTY_NOTICES.md`：随产物提供署名与许可。
- `scripts/test-email-reader.mjs`：真实 Vue 组件与模拟 Tauri 边界的 Chromium 检查。
- 本文档：来源、矩阵、限制和部署信息。未修改其他现有 UI 工作，未做提交。

## 测试矩阵与证据

所有时间为北京时间。日志、截图和文件 hash 见后面的证据目录；截图内容全为测试夹具，不是真实邮件。

|provider / 环境|测试项|结果|证据|
|---|---|---|---|
|通用 / Windows 原生测试 exe|现有 ID、MIME 头、host、错误、畸形响应、IDLE/轮询、历史重试，加正文 MIME 选择、跳过附件、BODY.PEEK、分离 UID/正文、错误 UID/section、大小/深度限制、正文编码|15/15 通过|reader-replay.log；直接编译本项目 email_imap.rs，在 Windows 执行。新正文用合成协议夹具，不冒充真实录制邮件|
|Gmail / Windows 实际 TLS IMAP|读取当前配置账号的最近三封正文|3/3 通过|reader-native-live.log；2026-11-16 00:25:18 开始。共用本次实际模块，凭据仅从本机凭据管理器读入内存；连接和查询 4247 ms，正文分别 2828/6968/1847 ms，三封均为 HTML|
|Gmail / 同上|读取前后被测邮件的未读状态|未变化|reader-native-live.log，selected_unread_flags_unchanged=true；未记录地址、UID、主题、正文或凭据。该测试不是完整 Tauri 点击链路|
|通用 / Chromium + 实际 Vue|阅读导航、原位置/焦点、正文滚动、320/420 宽度、浅深色、HTML 清理、默认阻止外图、手动加载图片、外链、错误重试、纯文本转义、过期响应、KeepAlive 离页清理|通过|reader-browser.log、reader-*.png；使用模拟 IPC，不是真实 Windows 点击验收|
|通用 / 实际 TS + 模拟事件|历史补收排序、去重、已读保持、持久化、历史不弹 peek、实时 peek|通过|reader-history-regression.log；node scripts/test-email-history.mjs|
|通用|npm run vite:build|通过|reader-vite-build.log；Tauri 发布构建还会重新执行|
|Windows x64|cargo check --locked --offline --target x86_64-pc-windows-msvc|通过|reader-check.log|
|通用|npx vue-tsc --noEmit|未通过，仍为既有 4 项，没有新增|reader-types.log：useTimer.ts:69 两项 TS2362；PanelApp.vue:193/259 两项 TS6133|
|Windows x64|npx tauri build --no-bundle --target x86_64-pc-windows-msvc|通过|reader-tauri-build.log|
|QQ / 163 / 126 / Outlook / custom|本次新阅读页的真实正文读取|未验证|现有本机凭据是 Gmail，未索要或写入其他账号；此前用户认可的 QQ/163 连接与收信不能代替新正文测试|
|Windows 实际 GUI|新版阅读页真实点击、返回、网页跳转及视觉验收|未验证|computer-use 的 Node 工具在工作区路径解析阶段返回 sandboxCwd is not a local file URI；重试、重置后仍失败。未把浏览器测试当作桌面验收|

## 本机发布与证据目录

- 构建完成：2026-11-16 **00:28:20 +08:00**；部署并从桌面“专注岛”快捷方式启动：**11:51:40 +08:00**。
- 产物：`E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，13,227,008 字节，版本号仍为 2.10.0，以构建时间和 SHA256 区分此次构建。
- SHA256：`9ea729628210f6a552726dc7aaf31c637d3f967cb88de9232587ff900f6613f7`。
- `reader-launch.log` 记录快捷方式目标、产物 hash、启动时间、进程路径和非零窗口句柄。它证明新产物启动成功，不代替真实阅读页点击验收。
- 覆盖前的 exe 已备份至 `/home/lqy/.cache/flowisle-deploy/focus-island-before-reader-20261116.exe`。没有改写账号设置或凭据。
- [本地证据目录](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-mail-reader-20261116)：完整日志、截图、源码 hash、原生测试 probe 源码、构建及部署元数据。
- [页面截图预览](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-mail-reader-20261116/preview.html)：浅色、深色、窄面板与错误页；截图均为合成测试邮件。

## 已知限制、未完成项

- 这次部署邮件详情改进；QQ 专用唤回、微信普通提醒/摘要、短信桥接均未新增。
- 只有当前设置的单个邮箱可读正文；旧账号通知仍保留，身份不匹配会提示去网页查看。Outlook OAuth2、多账号、附件预览/保存、发送/回复没有实现。
- 大于 512 KiB 的编码后正文、异常格式、过深嵌套或不支持的编码会显示错误和网页入口；不把错误伪装为空白成功。
- 外部图片默认关闭；CID 内嵌图片、邮件自带 CSS 不渲染。阅读不修改服务器已读状态；页面“全部已读”仍只管理 FlowIsle 的通知记录。
- 每次打开会新建只读连接。真实 Gmail 样本的正文获取最终复测最快约 1.8 秒、最慢约 7.0 秒，连接另需约 4.2 秒；不是即时加载保证，也不能据此推断 QQ/163 的时延。
- 本轮没有再次验证 QQ/163 的实时新信延迟、实体关机期间收信补录或各 provider 的过期凭据。此前历史补收部署证据见 `docs/email-history-validation.md`。
- Windows GUI 自动化不可用；发布进程/快捷方式核验与用户视觉验收分开。

## 复现

1. 桌面“专注岛”打开 FlowIsle → 通知 → 邮件，点击一条当前邮箱记录：应出现主题、发件人、时间与正文。
2. 正文较长时滚动正文，点“返回列表”或 Esc，应回原列表位置。切到设置再回通知，应先显示列表，不残留正文。
3. 网页邮箱按钮仍按已知 provider 打开官方网页；自定义邮箱没有安全映射时不猜 URL。
4. HTML 邮件的外部图片默认不请求。点“加载外部图片”后才允许网络请求；该行为可能让发件人获知阅读。
5. 自动回归：先 `npm run vite:dev`，再 `PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs EVIDENCE_DIR=/tmp/reader-evidence node scripts/test-email-reader.mjs`。测试依赖外部 Playwright，不进入应用依赖。
6. Rust 标准测试可在 Windows 开发环境执行 `cargo test --manifest-path src-tauri/Cargo.toml --lib email_imap::tests`；本机遵循 WSL 构建约束，用独立 probe 引用同一源码交叉编译后在 Windows 运行。相关 probe 源码随本地证据保存。
