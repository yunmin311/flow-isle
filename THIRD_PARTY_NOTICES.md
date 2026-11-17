# Fly Island adaptations

The mail reader layout, request-generation handling, HTML allowlist and MIME
text-part selection are adapted from flyl1u/fly-island v3.0.8, commit
`6acdc85bea085ab3023f8e91c742bcb1c709bc9e` (MIT).

Sources: `src/features/messages/mail/{MailPanel.tsx,MailPanel.css,useMailReader.ts}`
and `src-tauri/src/mail/content.rs`.
https://github.com/flyl1u/fly-island/tree/6acdc85bea085ab3023f8e91c742bcb1c709bc9e

The shell notification window and QQ tray activation are adapted from
`src-tauri/src/win32/message_window.rs`, `src-tauri/src/win32/shell_hook.rs`,
`src-tauri/src/wechat_reminders/source.rs` and
`src-tauri/src/qq_notifications/launcher.rs` at the same MIT commit.
FlowIsle uses taskbar attention events without process memory modification.

FlowIsle adapts these portions to Vue and its existing bounded IMAP transport.
No code from the later GPL releases is incorporated.

MIT License

Copyright (c) 2026 flyl1u and contributors
Copyright (c) 2026 TixXin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
