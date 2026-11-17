# 截图区后续修复验收 — 2026-11-17

## 改动摘要

- 收集错误与操作状态分别显示；复制、移除、开关切换及清空开始时清除旧错误。操作进入串行队列后再次清除，避免正在执行的采集留下旧提示。
- 复制原图改由 Rust 使用现有剪贴板插件写入 PNG，并返回 Windows 剪贴板序列号。复制与采集共用前端队列，自身写入事件即使早于命令返回也不会读取像素；只跳过该序列号，后续外部图片仍可收集。原有内容去重保留。
- 增加“清空全部截图”及就地确认/取消，同时删除记录与对应本机原图。删除失败的记录保留供重试，失败不报成功；不改变自动收集开关。
- 开关旁直接展示“默认开启 · 包含普通图片 · 仅本机保存”，不再只依赖悬浮提示。
- 删除废弃 useUpdater 模块、其隐藏设置/横幅及 npm updater 依赖。保留 useForkUpdate 的发布页检查入口；没有新增依赖。

## 本轮文件

| 文件 | 用途 |
| --- | --- |
| src/panel/ScreenshotShelf.vue | 分离反馈、可见收集范围、清空入口与确认 |
| src/composables/useScreenshots.ts | 串行复制及自身序列跳过、旧错误清除、清空与失败保留 |
| src-tauri/src/screenshot_clipboard.rs | 原生写入并返回序列号；与轮询协调 |
| src-tauri/src/lib.rs | 注册 copy_screenshot_image |
| src-tauri/capabilities/default.json | 为清理操作增加 fs:allow-exists |
| src/composables/useUpdater.ts | 删除废弃模块 |
| src/panel/PanelApp.vue、src/panel/SettingsPage.vue | 移除废弃更新模块的调用和隐藏界面 |
| package.json、package-lock.json | 只移除 updater 依赖，保留其他依赖版本 |
| scripts/test-screenshots.mjs | 新增回采竞态、状态恢复、清空失败/重试等回归 |
| README.md、本文件 | 行为及证据说明 |

## 测试矩阵与证据

证据目录：/mnt/c/Users/lqy/.codex/visualizations/2026/11/13/01a1d3c5-b1eb-7ea0-85e7-73fcb0191619/flowisle-screenshots-followup-20261117

以下浏览器用例挂载真实 Vue 组件/状态模块，图像编码和 Canvas 为真实浏览器行为；剪贴板、文件及 Windows 命令使用测试替身。没有读取用户私有图片或邮箱凭据。

| 测试 | 结果与边界 | 证据 |
| --- | --- | --- |
| 旧错误后复制成功、移除、切换 | 通过；旧 alert 清除，新状态独立显示 | screenshots.log |
| 自身写入事件先于 IPC 返回、延迟重复事件 | 通过；读取像素次数均未增加，非仅内容去重 | screenshots.log |
| 后续外部图片、复制失败后新图 | 通过；能正常采集 | screenshots.log |
| 原图复制 | 浏览器通过：PNG 解码仍为 800×450，不是缩略图 | screenshots.log |
| 清空取消、部分删除失败、重试 | 通过；取消保留，失败文件仍有记录，重试删除原图 | screenshots.log |
| 清空后重载、开关保持 | 通过；记录/原图为空且不改变开关 | screenshots.log |
| 保留原功能 | 通过：启动前图片跳过、暂停、去重、重启记录、尺寸上限、20 张和 7 天清理 | screenshots.log |
| 布局 | 浏览器通过：320/420 宽、浅/深色；已查看窄屏和通知页合成背景截图 | screenshots-light-320.png 等、notifications-screenshots-dark.png |
| 设置页回归 | 浏览器通过：账户切换/编辑及布局回归；凭据命令使用替身 | settings.log |
| 类型检查 | npx vue-tsc --noEmit 退出 0 | types.log |
| Rust 检查 | WSL cargo check --offline --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc 退出 0 | cargo-check.log |
| 前端与 release | npx tauri build --no-bundle --target x86_64-pc-windows-msvc 退出 0；内部 npm run vite:build 通过 | build.log |
| updater 清理 | 包/锁文件/源码引用审计通过；保留当前发布页检查 | updater-audit.log |
| Windows 原生后台采集 | 通过：新版采集 853×479 合成图片，保存同尺寸原图及 320×180 缩略图 | native-clipboard.log、native-capture.json、native-fixture.png |
| 清理测试数据 | 只删除已知合成图片；其余记录和开关保留；剪贴板已恢复 | fixture-cleanup.log、native-clipboard.log |
| 桌面快捷方式部署 | 通过：目标、SHA256、进程路径、启动时间及窗口句柄核对一致 | deploy.json、launch-final.log |
| Windows 实际点击复制/清空 | 未验证：桌面工具初始化被 sandboxCwd URI 错误阻断，不将浏览器用例称为原生点击通过 | desktop-tool-limit.log |

## release

- 构建完成：2026-11-17 12:15:28 +08:00（文件时间）；构建命令 12:15:29 退出 0。
- 产物：`E:\30_项目\focus-island\src-tauri\target\release\focus-island.exe`，11,229,184 字节，版本仍为 2.10.0。
- SHA256：`3461243e785af4df32075aa14679cdd20ac8ecca9b19a089f70b4b8a5d0f5aa3`。
- 通过桌面 `专注岛.lnk` 最终启动，Windows 进程启动时间 12:18:40 +08:00，PID 43292，目标为上述新文件。
- 替换前备份：`/home/lqy/.cache/flowisle-deploy/focus-island-before-screenshot-followup-20261117.exe`。

## 复现与未完成项

1. 打开面板 → 通知 → 截图：开关旁应直接显示收集范围。截图后点击“复制原图”，粘贴到画图检查分辨率；截图区不应因自身复制增加记录。
2. 点击“清空全部截图”先取消，确认记录仍在；再次点击并确认，记录及本机原图应清空。此操作会删除真实收集图片，本轮原生测试没有代用户点击它。
3. 自动化：先在 WSL 执行 `npm run vite:dev`，然后 `PLAYWRIGHT_MODULE=/home/lqy/.cache/asi-gate-tools/node_modules/playwright-core/index.mjs EVIDENCE_DIR=/tmp/flowisle-screenshot-evidence node scripts/test-screenshots.mjs`。该 Playwright 来自已有外部工具，不加入项目依赖。
4. 构建使用本机已有 WSL MSVC 交叉工具链：`source /home/lqy/.cache/flowisle-deploy/env.sh` 后执行上述 Rust/Tauri 命令。
5. 仍待真实 Windows UI 复制/清空按钮及用户视觉验收。本轮未重测邮箱/系统通知，也未实现系统级通知拦截。
6. 自动收集仍默认开启，包含普通复制图片；清空针对当前索引中的截图和原图，不清理 Windows 剪贴板历史。应用退出期间不收集；Windows 之外的自动监听仍未支持。
