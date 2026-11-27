<div align="center">

# FlowIsle

**屏幕顶部的灵动岛专注计时器 · Windows 增强版**

*专注时在，需要时隐，从不打扰。*

[![Release](https://img.shields.io/github/v/release/yunmin311/flow-isle?style=flat-square&color=0E6B8A)](https://github.com/yunmin311/flow-isle/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D4?style=flat-square&logo=windows)](https://github.com/yunmin311/flow-isle/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?style=flat-square&logo=tauri)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-42B883?style=flat-square&logo=vuedotjs)](https://vuejs.org/)
[![License](https://img.shields.io/badge/License-Apache--2.0-10B981?style=flat-square)](LICENSE)

<br />

![FlowIsle Promo Preview](image/flowisle-demo.gif)

<sub>🎬 完整 1080p 宣传片（Remotion 渲染）：<a href="https://github.com/yunmin311/flow-isle/releases/download/v2.10.0/FlowIsle-v2.10.0-promo-1080p.mp4">下载 / 观看 FlowIsle-v2.10.0-promo-1080p.mp4</a></sub>

</div>

---

> FlowIsle 是一款 Windows 优先的桌面灵动岛专注工具，基于 [FocusIsland](https://github.com/ipfred/focus-island)（Apache-2.0）深度演化。它以 **Liquid Glass × Pixel Craft** 视觉语言常驻屏幕顶部，将番茄专注、像素宠物伴侣、待办清单、专注电台、系统通知/邮件镜像、剪贴板截图与备忘录收纳在一个轻盈、无打扰的顶部胶囊之中。

---

## 核心特性

### 1. 灵动岛桌面交互
- **三种显示形态**：常驻、停靠、隐藏自由切换；默认收为屏幕顶部刘海，悬停展开，点击弹出面板。
- **不遮挡工作流**：鼠标靠近自动隐避并启用窗口点击穿透，支持独立调节岛与面板透明度、失焦自动淡隐。
- **Liquid Glass × Pixel Craft**：通透的液态玻璃层叠质感结合整数网格自定义像素图标、等宽数字仪表盘与克制的像素微粒微交互，内置深色/浅色/跟随系统及 5 套主题色。

### 2. 像素宠物伴侣与动态场景养成
- **常驻陪伴与互动**：22 位像素小动物伴侣，支持自定义伴侣昵称、柔和像素呼吸动效、点击轻拍互动、像素爱心反馈与物种专属台词气泡，陪伴时长累计可解锁成长阶段与纪念相册。
- **专注星光兑换动态背景**：每专注 1 分钟累计 1 星光（不扣减专注统计），可兑换 22 套伙伴场景与 18 套高级动态背景（星光闪烁、营火萤光、花瓣轻飘、海蓝气泡、细雨虹光、咖啡热气、晶石微尘等纯 CSS/SVG 轻量化氛围动效），随时为任意伙伴自由搭配。
- **跨窗口事件联动**：当收到新邮件、系统通知、播放专注电台或切换专注/休息阶段时，顶部灵动岛与面板内的像素伴侣会实时呈现对应像素表情（信封、音符、爱心、休眠等）。

### 3. 专注计时与任务清单
- **番茄钟状态机**：专注 / 休息自动切换，支持暂停、提前完成、提前休息与统计回滚（取消完成时同步回退当日专注数据）。
- **核心专注区 & 全屏 TODO**：支持自定义分组颜色、每日任务、重复任务、子任务、到期日、右键级联菜单，以及 `Shift+Enter` 快捷创建并立即开专。
- **专注统计与成就**：记录专注历史、连续专注天数、趋势图表与里程碑成就。

### 4. 通知中心、邮件提醒 & 剪贴板截图
- **Windows 通知镜像**：捕获本机系统通知，支持来源筛选、单条展开/复制/已读与岛内 5 秒自动收起 Peek 提示（悬停暂停，专注时可静默）。
- **Windows 11 勿扰模式（DND）实时监测**：通过 WinRT 原生 API 实时读取系统勿扰模式状态，并在设置页提供一键跳转 Windows 系统通知设置。
- **IMAP 邮件提醒**：支持 QQ、163、126、Gmail、Outlook 及自定义 IMAP；支持 IDLE 实时监听（无 IDLE 服务自动 10 秒轮询）；仅拉取发件人、主题与时间，不读取正文，授权码安全存储于 Windows 凭据管理器。
- **剪贴板截图收集**：自动收集应用运行期间复制到剪贴板的图片，展示缩略图并支持一键复制完整分辨率原图、暂停收集、单张移除与一键清空。

### 5. 专注电台 & 备忘录
- **专注电台（Radio Deck）**：内置像素频谱甲板与一体化像素分段音量条，支持在线电台流、M3U/PLS 歌单导入与本地音频播放。
- **富文本备忘录**：支持分类、关键词搜索与随手记录，搭配系统音量快捷控制、全局快捷键与自定义空闲激励语。

---

## 下载与使用

前往 **[FlowIsle Releases](https://github.com/yunmin311/flow-isle/releases)** 下载最新版本：

- **便携可执行版**：下载 `FlowIsle-v2.10.0-windows-x64-portable.zip`，解压后直接运行 `FlowIsle.exe`（Windows 10/11，需已安装系统自带的 WebView2 Runtime）。
- **检查更新**：设置页中的“检查更新”仅检测 `yunmin311/flow-isle` Releases 并打开发布页供手动下载。

> **说明**：应用标识 `com.focus-island.desktop` 目前作为兼容标识保留，以确保既有用户的数据目录与配置平滑延续。

---

## 本地开发与源码构建

### 环境要求
- Windows 10 / 11
- Node.js 18+
- Rust 1.80+
- Visual Studio C++ Build Tools
- Microsoft Edge WebView2 Runtime

### 运行与打包

```powershell
# 安装前端依赖
npm install

# 开发模式（前端热更新 + Rust 后端）
npm run dev

# 构建 Release 单文件可执行程序
npx tauri build --no-bundle
```

构建产物位于：

```text
src-tauri/target/release/focus-island.exe
```

如需生成 NSIS / MSI 安装包：

```powershell
npm run build
```

---

## 数据与隐私

- **完全本地存储**：设置、任务、备忘录、通知记录与统计数据均保存在本机 `%APPDATA%\com.focus-island.desktop\focus-island`。
- **剪贴板截图保护**：截图仅保存在上述目录的 `screenshots` 子目录中，不上传云端；上限 20 张、自动清理超过 7 天的记录，不回采启动前的历史剪贴板，可在通知页随时关闭自动收集或一键清空。
- **邮箱凭据安全**：IMAP 授权码保存在 Windows 凭据管理器（target 为 `FocusIsland/Email`），不写入明文配置文件；仅读取发件人、主题与时间元数据。
- **无额外云端追踪**：除用户主动配置的 IMAP 邮箱与电台音频源外，不连接任何第三方账号或遥测服务。

---

## 许可证与上游归属

- 本项目基于 [ipfred/focus-island](https://github.com/ipfred/focus-island)（v2.9.0，Apache License 2.0）进行 Windows 专属增强与界面重构。
- 原项目版权归 FocusIsland contributors 所有；本仓库完整保留 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)，所有修改部分同样依据 **Apache License 2.0** 分发。
- `FocusIsland` / `专注岛` 名称、Logo 与上游品牌素材归原项目所有；**FlowIsle** 为独立衍生项目，与上游无官方隶属关系。
