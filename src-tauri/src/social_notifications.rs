//! Taskbar attention reminders and safe activation of already-running messengers.
//! Shell-hook flow and QQ tray activation adapted from Fly Island v3.0.8 (MIT).
use crate::social_window::{self, WindowMessages};
use std::{cell::RefCell, collections::HashMap, time::{Duration, Instant}};
use windows::{core::{w, PWSTR, BOOL}, Win32::{
    Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM},
    System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::WindowsAndMessaging::*,
}};

pub(crate) fn identity(path: &str) -> Option<&'static str> {
    match path.rsplit(['\\', '/']).next()?.to_ascii_lowercase().as_str() {
        "weixin.exe" | "wechat.exe" => Some("wechat"), "qq.exe" => Some("qq"), _ => None,
    }
}
fn window_identity(window: HWND) -> Option<&'static str> {
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(window, Some(&mut pid)); }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut path = [0u16; 32768]; let mut len = path.len() as u32;
    let result = unsafe { QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(path.as_mut_ptr()), &mut len) };
    let _ = unsafe { CloseHandle(process) };
    result.ok()?;
    identity(&String::from_utf16_lossy(&path[..len as usize]))
}
fn class_name(window: HWND) -> String {
    let mut text = [0u16; 256];
    let len = unsafe { GetClassNameW(window, &mut text) };
    String::from_utf16_lossy(&text[..len.max(0) as usize])
}
struct Context { message: u32, pending: HashMap<&'static str, Instant>, last: HashMap<&'static str, Instant> }
thread_local! { static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) }; }
struct Receiver;
impl WindowMessages for Receiver {
    fn handle(_: HWND, message: u32, kind: WPARAM, target: LPARAM) -> Option<LRESULT> {
        CONTEXT.with(|slot| {
            let Ok(mut state) = slot.try_borrow_mut() else { return };
            let Some(state) = state.as_mut() else { return };
            if message != state.message { return; }
            if kind.0 as u32 != (HSHELL_REDRAW | 0x8000) { return; }
            let Some(app) = window_identity(HWND(target.0 as *mut _)) else { return };
            if window_identity(unsafe { GetForegroundWindow() }) == Some(app) { return; }
            if state.last.get(app).is_some_and(|last| last.elapsed() < Duration::from_secs(30)) { return; }
            state.pending.entry(app).or_insert_with(Instant::now);
        });
        None
    }
}
static LAST_QQ_TOAST: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
pub(crate) fn note_toast(app: &str) {
    if app.eq_ignore_ascii_case("qq") { if let Ok(mut last) = LAST_QQ_TOAST.lock() { *last = Some(Instant::now()); } }
}
pub(crate) fn run(mut emit: impl FnMut(&str)) -> Result<(), String> {
    let instance = social_window::module_instance().map_err(|_| "社交提醒窗口初始化失败")?;
    let class = "FlowIsleSocialReminder";
    social_window::register_class::<Receiver>(instance, class).map_err(|_| "社交提醒窗口注册失败")?;
    let window = social_window::create_tool_popup_window(instance, class, "").map_err(|_| "社交提醒窗口创建失败")?;
    struct Cleanup(HWND, windows::Win32::Foundation::HINSTANCE);
    impl Drop for Cleanup { fn drop(&mut self) { unsafe { let _ = DeregisterShellHookWindow(self.0); } let _ = social_window::destroy_window(self.0); let _ = social_window::unregister_class(self.1, "FlowIsleSocialReminder"); } }
    let _cleanup = Cleanup(window, instance);
    let message = unsafe { RegisterWindowMessageW(w!("SHELLHOOK")) };
    if message == 0 || !unsafe { RegisterShellHookWindow(window) }.as_bool() { return Err("Windows 不允许监听任务栏提醒".into()); }
    CONTEXT.with(|s| *s.borrow_mut() = Some(Context { message, pending: HashMap::new(), last: HashMap::new() }));
    loop {
        social_window::dispatch_pending_messages();
        let ready = CONTEXT.with(|s| {
            let mut s = s.borrow_mut(); let Some(s) = s.as_mut() else { return Vec::new() };
            let ready = s.pending.iter().filter(|(_, time)| time.elapsed() >= Duration::from_secs(2)).map(|(app, _)| *app).collect::<Vec<_>>();
            for app in &ready { s.pending.remove(app); s.last.insert(app, Instant::now()); }
            ready
        });
        for app in ready {
            if window_identity(unsafe { GetForegroundWindow() }) == Some(app) { continue; }
            if app == "qq" && LAST_QQ_TOAST.lock().ok().is_some_and(|last| last.is_some_and(|t| t.elapsed() < Duration::from_secs(10))) { continue; }
            emit(app);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
struct Search { app: String, windows: Vec<HWND>, trays: Vec<HWND> }
unsafe extern "system" fn find(window: HWND, param: LPARAM) -> BOOL {
    let search = unsafe { &mut *(param.0 as *mut Search) };
    if window_identity(window) != Some(search.app.as_str()) { return BOOL(1); }
    let class = class_name(window);
    if search.app == "qq" && class == "Electron_NotifyIconHostWindow" { search.trays.push(window); return BOOL(1); }
    if unsafe { GetWindow(window, GW_OWNER) }.is_ok_and(|owner| !owner.is_invalid()) { return BOOL(1); }
    let mut rect = windows::Win32::Foundation::RECT::default();
    if unsafe { GetWindowRect(window, &mut rect) }.is_err() || rect.right - rect.left < 250 || rect.bottom - rect.top < 200 { return BOOL(1); }
    if (search.app == "qq" && ["Chrome_WidgetWin_1", "TXGuiFoundation"].contains(&class.as_str()))
        || (search.app == "wechat" && (class.starts_with("Qt") || class == "WeChatMainWndForPC")) {
        search.windows.push(window);
    }
    BOOL(1)
}
fn search(app: &str) -> Result<Search, String> {
    let mut search = Search { app: app.into(), windows: Vec::new(), trays: Vec::new() };
    unsafe { EnumWindows(Some(find), LPARAM(&mut search as *mut _ as isize)) }.map_err(|_| "无法查找社交应用窗口")?;
    Ok(search)
}
pub(crate) fn activate(app: &str) -> Result<(), String> {
    let search = search(app)?;
    // Never ShowWindow on QQ's hidden Electron preload windows. Restore through its tray.
    if app == "qq" && !search.windows.iter().any(|h| unsafe { IsWindowVisible(*h) }.as_bool()) {
        use windows::Win32::UI::Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER};
        if search.trays.len() != 1 { return Err("未找到唯一的 QQ 托盘入口，请从系统托盘打开 QQ".into()); }
        let tray = search.trays[0]; let mut found = None;
        for id in 2..=256 {
            let icon = NOTIFYICONIDENTIFIER { cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32, hWnd: tray, uID: id, ..Default::default() };
            if unsafe { Shell_NotifyIconGetRect(&icon) }.is_ok() && found.replace(id).is_some() { return Err("QQ 有多个托盘图标，请从系统托盘打开".into()); }
        }
        let id = found.ok_or("QQ 托盘尚未就绪，请先打开并登录 QQ")?;
        for message in [WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_LBUTTONUP] {
            if unsafe { SendMessageTimeoutW(tray, WM_APP + 1, WPARAM(id as usize), LPARAM(message as isize), SMTO_ABORTIFHUNG, 500, None) }.0 == 0 { return Err("QQ 未响应，请从系统托盘打开".into()); }
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    let current = self::search(app)?;
    let window = current.windows.iter().find(|h| unsafe { IsWindowVisible(**h) }.as_bool())
        .or_else(|| (app == "wechat").then(|| current.windows.first()).flatten()).ok_or("未找到可用窗口，请先打开并登录桌面应用")?;
    unsafe { let _ = ShowWindow(*window, SW_RESTORE); }
    if unsafe { SetForegroundWindow(*window) }.as_bool() { Ok(()) }
    else { Err("Windows 未允许切到前台，请从任务栏打开；通知记录已保留".into()) }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_accepts_shell_hook_registration() {
        let instance = social_window::module_instance().unwrap();
        let class = "FlowIsleTestSocialHook";
        social_window::register_class::<Receiver>(instance, class).unwrap();
        let window = social_window::create_tool_popup_window(instance, class, "").unwrap();
        assert!(!unsafe { IsWindowVisible(window) }.as_bool());
        assert_ne!(unsafe { RegisterWindowMessageW(w!("SHELLHOOK")) }, 0);
        let registered = unsafe { RegisterShellHookWindow(window) }.as_bool();
        if registered { assert!(unsafe { DeregisterShellHookWindow(window) }.as_bool()); }
        social_window::destroy_window(window).unwrap();
        social_window::unregister_class(instance, class).unwrap();
        assert!(registered);
    }
    #[test] fn matches_executable_not_substring() {
        assert_eq!(identity(r"C:\Apps\Weixin.exe"), Some("wechat"));
        assert_eq!(identity(r"C:\Apps\QQ.exe"), Some("qq"));
        assert_eq!(identity(r"C:\Apps\FakeQQ.exe"), None);
        assert_eq!(identity(r"C:\QQ.exe\other.exe"), None);
    }
}
