use serde::Serialize;
use tauri::{AppHandle, Runtime};
use std::sync::Mutex;

// Polling cannot observe a partially published image before its sequence is returned.
static CLIPBOARD_ACCESS: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize)]
pub struct ClipboardImageState {
    sequence: u32,
    has_image: bool,
}

#[tauri::command]
pub fn clipboard_image_state() -> ClipboardImageState {
    let _guard = CLIPBOARD_ACCESS.lock().unwrap_or_else(|e| e.into_inner());
    clipboard_image_state_unlocked()
}

fn clipboard_image_state_unlocked() -> ClipboardImageState {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::System::DataExchange::{GetClipboardSequenceNumber, IsClipboardFormatAvailable};
        ClipboardImageState {
            sequence: GetClipboardSequenceNumber(),
            // CF_BITMAP, CF_DIB and CF_DIBV5: no clipboard text or image content is read here.
            has_image: [2, 8, 17].iter().any(|format| IsClipboardFormatAvailable(*format).is_ok()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    ClipboardImageState { sequence: 0, has_image: false }
}

#[tauri::command]
pub async fn copy_screenshot_image<R: Runtime>(app: AppHandle<R>, png: Vec<u8>) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        let image = tauri::image::Image::from_bytes(&png).map_err(|_| "无法读取截图图片")?;
        let _guard = CLIPBOARD_ACCESS.lock().map_err(|_| "剪贴板暂不可用")?;
        app.clipboard().write_image(&image).map_err(|_| "无法写入剪贴板，请重试")?;
        Ok(clipboard_image_state_unlocked().sequence)
    }).await.map_err(|_| "复制截图失败".to_string())?
}

#[tauri::command]
pub fn start_clipboard_watch<R: Runtime>(_app: AppHandle<R>) {
    #[cfg(target_os = "windows")]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        use tauri::Emitter;
        static STARTED: AtomicBool = AtomicBool::new(false);
        if STARTED.swap(true, Ordering::SeqCst) { return; }
        // Native polling continues when the panel WebView is hidden. Existing clipboard
        // contents are deliberately skipped when starting the app.
        let mut previous = clipboard_image_state().sequence;
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let state = clipboard_image_state();
            if state.sequence != previous {
                previous = state.sequence;
                let _ = _app.emit_to("panel", "clipboard-image-changed", state);
            }
        });
    }
}
