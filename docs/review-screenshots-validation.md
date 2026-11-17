# 截图通知区与审查修复验收 — 2026-11-17

本次交付包括通知页截图收集、缩略图和复制原图，以及用户转来的编译、统计和更新配置审查建议。已有未提交功能与视觉改动继续保留；没有新增依赖、没有改写邮箱凭据。

## 实际行为

- Windows 运行期间复制到剪贴板的图片进入通知页“截图”区，包括系统截图工具和普通复制图片。后台按 500 ms 检查剪贴板版本变化；只在发现图片时读取内容。启动前已有图片不采集。
- 默认展示最近两张，可展开剩余图片。点击缩略图或“复制原图”复制完整分辨率 PNG；保留像素尺寸，不保证与截图源文件的压缩字节完全相同。
- “自动收集”开关会保存；暂停时不读取新图片。内容散列用于去重，复制已收集图片不会新增一条。截图不增加通知未读数，也不触发岛内提醒。
- 图片只保存在本机 AppData 的 `focus-island/screenshots` 下；原图以 PNG data URL 存入 JSON，索引保存缩略图。最多 20 张；启动和收集时清理超过 7 天的记录。应用持续空闲期间不定时清理。
- 超过 2000 万像素，或 PNG data URL 超过 16 MiB，明确提示未收集。不是从 Windows 截图文件夹或历史剪贴板补采。
- 修复计时器设置监听的元组类型、删除面板未使用的定位代码；最近七天统计改为查完整历史，跨周时不会丢失上周数据。
- 移除 Rust 自动更新插件、权限及原上游更新地址/公钥。现有可见“检查更新”仍走 FlowIsle 发布页。兼容标识 `com.focus-island.desktop` 保留，避免现有数据目录和安装身份改变；没有实施安装身份迁移。

## 文件列表

| 文件 | 本次内容 |
|---|---|
| `src/composables/useScreenshots.ts` | 剪贴板图片读取、缩略图、存储、去重、保留策略、复制与移除 |
| `src/panel/ScreenshotShelf.vue` | 通知页截图组件与操作反馈 |
| `src/panel/NotificationsPage.vue` | 挂载截图区，保留现有通知分组 |
| `src/panel/PanelApp.vue` | 启动后台收集；删除未使用符号 |
| `src-tauri/src/screenshot_clipboard.rs` | Windows 剪贴板版本和图片格式检查、后台事件 |
| `src-tauri/src/lib.rs` | 注册截图命令、移除更新插件初始化 |
| `src-tauri/capabilities/default.json` | 现有剪贴板插件的图片权限，截图目录删除权限；移除更新权限 |
| `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` | 开启现有 Windows crate 的 DataExchange 功能；移除 Rust updater 依赖 |
| `src-tauri/tauri.conf.json` | 删除旧更新服务配置 |
| `src/composables/useTimer.ts` | 明确监听数组为元组 |
| `src/panel/StatsPage.vue` | 七日趋势查询 `allStatsMap` |
| `scripts/test-screenshots.mjs` | 实际 Vue/Canvas 的交互与存储回归；外部 IPC 使用合成数据 |
| `scripts/test-stats-trend.mjs` | 跨周、跨月、跨年和响应式更新回归 |
| `README.md`、本文 | 行为、隐私边界、兼容标识和验收说明 |

## 测试矩阵与证据

证据目录：[flowisle-screenshots-review-20261117](/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-screenshots-review-20261117)。下列文件均位于该目录；时间为北京时间。

| 检查 | 结果与边界 | 证据 / 时间 |
|---|---|---|
| TypeScript 类型检查 | 通过，`vue-tsc --noEmit` 退出 0；先前四处错误清除 | `types.log`，11:42:17 |
| Windows Rust 检查 | 通过，Windows MSVC target `cargo check --offline` 退出 0 | `cargo-check.log`，11:29:44 |
| 前端生产构建 | 通过，Tauri 的 `beforeBuildCommand` 实际执行 `npm run vite:build` | `build.log`，11:36:55–11:39:52 |
| Windows release 构建 | 通过，`npx tauri build --no-bundle --target x86_64-pc-windows-msvc` 退出 0 | `build.log`，11:39:52 |
| 真实 Windows 后台收集 | 通过：合成 853×479 图片发布到 Windows 剪贴板，运行中的 release 自动保存原图 853×479、缩略图 320×180；无需打开通知页 | `native-clipboard.log`、`native-capture.json`、`native-fixture.png`，11:41:10 |
| 真实 Windows 重启保留 | 通过：快捷方式重启后索引和原图仍在，记录只有一条 | `restart.log`、`native-restart.json`，11:42–11:43 |
| 真实 Windows 重复图片去重 | 通过：重启后再次发布同一合成图，仍为一条，原时间未改变 | `native-clipboard-repeat.log`、`native-dedup.json`，11:43:53 |
| 缩略图与复制原图 | 浏览器通过：实际组件点击“复制原图”，提交给剪贴板插件的 PNG 解码后为 800×450，缩略图宽 320 | `screenshots.log`，11:40:59；插件 IPC 为测试替身 |
| 暂停收集与开关持久化 | 浏览器通过：暂停后不调用图片读取，重载保持暂停 | `screenshots.log` |
| 删除、容量与过期清理 | 浏览器通过：移除原图文件、最多 20 张、过期清理同时删原图 | `screenshots.log` |
| 异常处理 | 浏览器通过：剪贴板读取失败重试、保存失败、复制失败、像素上限都有反馈；失败不新增记录 | `screenshots.log` |
| 布局 | 浏览器通过：320/420 宽，浅/深色，横图/长图无横向溢出；实际通知页内截图区可见 | `screenshots-light-320.png` 等四张；`notifications-screenshots-light.png`、`notifications-screenshots-dark.png`。合成背景，不是 Windows 桌面截图 |
| 七日统计 | 通过：周一/周日、跨月/跨年、无数据补 0、分钟数、响应式历史更新 | `stats.log`，11:31:37 |
| 既有通知功能 | 通过自动回归：QQ/微信只提醒不记录；邮件历史补收、去重、专注静默、点击失败反馈等 | `history.log`、`peek.log`，11:31:38；合成事件，不是本轮真实邮箱或聊天端到端证据 |
| 桌面快捷方式启动 | 通过：目标路径、产物散列、实际运行进程路径和非零窗口句柄一致 | `launch-final.log`，11:43:52–11:43:57 |
| Windows 原生按钮点击后粘贴到其他应用 | **尚未验证**：桌面控制工具初始化失败；不能用浏览器结果代替 | `desktop-tool-limit.log`，`sandboxCwd is not a local file URI` |

测试只使用合成图片，没有记录私人图片内容。两次原生测试后恢复原剪贴板；测试程序退出后仅移除了该合成图片的索引和原图，保留其他记录和开关。证据见 `fixture-cleanup.log`。用于复现的原生夹具 `screenshot-fixture.ps1` 也存于证据目录；它会暂时替换剪贴板，并停止指定路径的测试应用后恢复剪贴板。

## 部署

- 构建完成：**2026-11-17 11:39:52 +08:00**，版本号仍为 **2.10.0**。
- 产物：`E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，**11,201,536 字节**。
- SHA256：`1f98be87021bc07457b7c943a8a354fb7d114db591cd9875ec16bf666aa7e07c`。
- WSL 构建输出复制到上述路径后逐字节散列校验。桌面“专注岛.lnk”目标即此路径，最终启动时间 **11:43:52**。
- 旧产物备份：`/home/lqy/.cache/flowisle-deploy/focus-island-before-screenshots-20261117-1140.exe`。
- 未构建安装包、未推送发布。`imap-proto 0.10.2` 仍有已有的未来兼容性警告；视觉守卫仍报告已有白色边框提示，但退出码为 0。保留 CI 签名产物配置，未验证发布工作流。

## 复现

1. 运行桌面“专注岛”，使用 `Win+Shift+S` 完成截图并确保图片已复制到剪贴板。
2. 打开面板 → 通知 → 截图。查看缩略图和原图尺寸；点缩略图或“复制原图”，在支持图片粘贴的软件中粘贴。
3. 再次复制同图，应保持一条；关闭“自动收集”后再截图，不应新增；“移除”会删除本机保存的原图。
4. 自动回归在 WSL 运行：`node scripts/test-stats-trend.mjs`、`node scripts/test-email-history.mjs`、`node scripts/test-notification-peek.mjs`。截图回归需先 `npm run vite:dev`，再设置外部 Playwright 模块路径运行 `node scripts/test-screenshots.mjs`；测试依赖未加入项目。
5. 本机截图回归命令：`PLAYWRIGHT_MODULE=/home/lqy/.cache/asi-gate-tools/node_modules/playwright-core/index.mjs EVIDENCE_DIR=/tmp/flowisle-screenshot-evidence node scripts/test-screenshots.mjs`。
6. 本机 Windows 构建先加载 `/home/lqy/.cache/flowisle-deploy/env.sh`，再运行上述 Windows target 检查与构建命令；此脚本配置的是本机交叉编译工具链。

本次没有重新验证真实邮箱、微信/QQ 到达时延、系统级 Toast 屏蔽，也没有实现 agent 审批按钮。Windows 原生复制按钮的界面验收、安装身份迁移与打包升级验证仍未完成。
