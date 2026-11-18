//! Fast Windows Toast mirror reading Windows Push Notifications' SQLite WAL
//! (`wpndatabase.db`) incrementally via `winsqlite3.dll`, woken immediately by
//! directory change notifications (`FindFirstChangeNotificationW`).
//!
//! Why: On unpackaged Win32 executables, `UserNotificationListener` rejects event
//! subscriptions (`0x80070490`) and `GetNotificationsAsync(Toast)` enumerates the
//! whole Action Center store across broker IPC (~5.5-7.7 s per poll on active systems).
//! Querying `Notification WHERE Type='toast' AND "Order" > ?` directly takes < 1 ms
//! while freeing read transactions immediately after each scan so WPN checkpoints aren't held.

use std::collections::{HashMap, HashSet};
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Runtime};
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, FreeLibrary, HANDLE, HMODULE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0};
use windows::Win32::Storage::FileSystem::{
    FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
    FILE_NOTIFY_CHANGE_LAST_WRITE, FILE_NOTIFY_CHANGE_SIZE,
};
use windows::Win32::System::Com::{CoTaskMemFree, IBindCtx};
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};
use windows::Win32::System::Threading::WaitForSingleObject;
use windows::Win32::UI::Shell::{IShellItem, SHCreateItemFromParsingName, SIGDN_NORMALDISPLAY};

use crate::{notification_diagnostic, social_notifications, SystemNotificationEvent};

const SQLITE_OK: c_int = 0;
const SQLITE_BUSY: c_int = 5;
const SQLITE_LOCKED: c_int = 6;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;
const SQLITE_OPEN_READONLY: c_int = 0x0000_0001;
const SQLITE_OPEN_URI: c_int = 0x0000_0040;

type OpenV2Fn = unsafe extern "C" fn(*const c_char, *mut *mut c_void, c_int, *const c_char) -> c_int;
type BusyTimeoutFn = unsafe extern "C" fn(*mut c_void, c_int) -> c_int;
type PrepareV2Fn = unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut *mut c_void, *mut *const c_char) -> c_int;
type BindInt64Fn = unsafe extern "C" fn(*mut c_void, c_int, i64) -> c_int;
type StepFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type ColumnInt64Fn = unsafe extern "C" fn(*mut c_void, c_int) -> i64;
type ColumnBytesFn = unsafe extern "C" fn(*mut c_void, c_int) -> c_int;
type ColumnBlobFn = unsafe extern "C" fn(*mut c_void, c_int) -> *const u8;
type ColumnTextFn = unsafe extern "C" fn(*mut c_void, c_int) -> *const u8;
type FinalizeFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type CloseFn = unsafe extern "C" fn(*mut c_void) -> c_int;

struct SqliteApi {
    module: HMODULE,
    open_v2: OpenV2Fn,
    busy_timeout: BusyTimeoutFn,
    prepare_v2: PrepareV2Fn,
    bind_int64: BindInt64Fn,
    step: StepFn,
    column_int64: ColumnInt64Fn,
    column_bytes: ColumnBytesFn,
    column_blob: ColumnBlobFn,
    column_text: ColumnTextFn,
    finalize: FinalizeFn,
    close: CloseFn,
}

impl Drop for SqliteApi {
    fn drop(&mut self) {
        if !self.module.is_invalid() {
            unsafe {
                let _ = FreeLibrary(self.module);
            }
        }
    }
}

unsafe fn load_sym<T>(module: HMODULE, name: &CStr) -> Result<T, String> {
    let proc = GetProcAddress(module, windows::core::PCSTR(name.as_ptr() as *const u8))
        .ok_or_else(|| format!("missing winsqlite3 symbol {}", name.to_string_lossy()))?;
    Ok(std::mem::transmute_copy(&proc))
}

impl SqliteApi {
    fn load() -> Result<Self, String> {
        let wide = HSTRING::from("winsqlite3.dll");
        let module = unsafe { LoadLibraryExW(&wide, None, LOAD_LIBRARY_SEARCH_SYSTEM32) }
            .map_err(|e| format!("LoadLibraryExW(winsqlite3.dll) failed: {e}"))?;
        unsafe {
            Ok(Self {
                module,
                open_v2: load_sym(module, c"sqlite3_open_v2")?,
                busy_timeout: load_sym(module, c"sqlite3_busy_timeout")?,
                prepare_v2: load_sym(module, c"sqlite3_prepare_v2")?,
                bind_int64: load_sym(module, c"sqlite3_bind_int64")?,
                step: load_sym(module, c"sqlite3_step")?,
                column_int64: load_sym(module, c"sqlite3_column_int64")?,
                column_bytes: load_sym(module, c"sqlite3_column_bytes")?,
                column_blob: load_sym(module, c"sqlite3_column_blob")?,
                column_text: load_sym(module, c"sqlite3_column_text")?,
                finalize: load_sym(module, c"sqlite3_finalize")?,
                close: load_sym(module, c"sqlite3_close")?,
            })
        }
    }

    fn open_readonly<'a>(&'a self, uri: &str) -> Result<DbConn<'a>, c_int> {
        let Ok(c_uri) = CString::new(uri) else {
            return Err(-1);
        };
        let mut db: *mut c_void = std::ptr::null_mut();
        let rc = unsafe { (self.open_v2)(c_uri.as_ptr(), &mut db, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI, std::ptr::null()) };
        if rc != SQLITE_OK || db.is_null() {
            if !db.is_null() {
                unsafe {
                    (self.close)(db);
                }
            }
            return Err(rc);
        }
        unsafe {
            (self.busy_timeout)(db, 40);
        }
        Ok(DbConn { api: self, handle: db })
    }
}

struct DbConn<'a> {
    api: &'a SqliteApi,
    handle: *mut c_void,
}

impl<'a> Drop for DbConn<'a> {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                (self.api.close)(self.handle);
            }
            self.handle = std::ptr::null_mut();
        }
    }
}

impl<'a> DbConn<'a> {
    fn prepare(&self, sql: &str) -> Result<Stmt<'a>, c_int> {
        let Ok(c_sql) = CString::new(sql) else {
            return Err(-1);
        };
        let mut stmt: *mut c_void = std::ptr::null_mut();
        let rc = unsafe {
            (self.api.prepare_v2)(self.handle, c_sql.as_ptr(), c_sql.as_bytes().len() as c_int, &mut stmt, std::ptr::null_mut())
        };
        if rc != SQLITE_OK || stmt.is_null() {
            if !stmt.is_null() {
                unsafe {
                    (self.api.finalize)(stmt);
                }
            }
            return Err(rc);
        }
        Ok(Stmt { api: self.api, handle: stmt })
    }
}

struct Stmt<'a> {
    api: &'a SqliteApi,
    handle: *mut c_void,
}

impl<'a> Drop for Stmt<'a> {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                (self.api.finalize)(self.handle);
            }
            self.handle = std::ptr::null_mut();
        }
    }
}

impl<'a> Stmt<'a> {
    fn bind_i64(&self, idx: c_int, value: i64) -> c_int {
        unsafe { (self.api.bind_int64)(self.handle, idx, value) }
    }

    fn step(&self) -> c_int {
        unsafe { (self.api.step)(self.handle) }
    }

    fn col_i64(&self, idx: c_int) -> i64 {
        unsafe { (self.api.column_int64)(self.handle, idx) }
    }

    fn col_text_lossy(&self, idx: c_int) -> String {
        unsafe {
            let bytes = (self.api.column_bytes)(self.handle, idx);
            if bytes <= 0 {
                return String::new();
            }
            let ptr = (self.api.column_text)(self.handle, idx);
            if ptr.is_null() {
                return String::new();
            }
            let slice = std::slice::from_raw_parts(ptr, bytes as usize);
            String::from_utf8_lossy(slice).into_owned()
        }
    }

    fn col_blob_utf8(&self, idx: c_int) -> String {
        unsafe {
            let bytes = (self.api.column_bytes)(self.handle, idx);
            if bytes <= 0 {
                return String::new();
            }
            let ptr = (self.api.column_blob)(self.handle, idx);
            if ptr.is_null() {
                return String::new();
            }
            let slice = std::slice::from_raw_parts(ptr, bytes as usize);
            String::from_utf8_lossy(slice).into_owned()
        }
    }
}

struct ChangeWatchGuard(HANDLE);

impl Drop for ChangeWatchGuard {
    fn drop(&mut self) {
        if self.0 != INVALID_HANDLE_VALUE && !self.0.is_invalid() {
            unsafe {
                let _ = FindCloseChangeNotification(self.0);
                let _ = CloseHandle(self.0);
            }
        }
    }
}

struct RawToastRow {
    order: i64,
    id: u32,
    arrival_filetime: i64,
    handler_id: i64,
    primary_id: String,
    payload_xml: String,
}

fn wpndatabase_paths() -> Option<(PathBuf, PathBuf)> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")?;
    let dir = PathBuf::from(local_app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Notifications");
    let db = dir.join("wpndatabase.db");
    Some((dir, db))
}

fn path_to_sqlite_ro_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut encoded = String::with_capacity(raw.len() + 24);
    encoded.push_str("file:///");
    for ch in raw.chars() {
        match ch {
            '%' => encoded.push_str("%25"),
            '?' => encoded.push_str("%3F"),
            '#' => encoded.push_str("%23"),
            ' ' => encoded.push_str("%20"),
            _ => encoded.push(ch),
        }
    }
    encoded.push_str("?mode=ro");
    encoded
}

fn filetime_to_unix_ms(filetime: i64) -> i64 {
    if filetime <= 0 {
        return 0;
    }
    (filetime / 10_000) - 11_644_473_600_000
}

fn unescape_xml(input: &str) -> String {
    if !input.contains('&') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'&' {
            if let Some(semi) = input[i..].find(';') {
                let entity = &input[i + 1..i + semi];
                let decoded = match entity {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                        u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32)
                    }
                    _ if entity.starts_with('#') => {
                        entity[1..].parse::<u32>().ok().and_then(char::from_u32)
                    }
                    _ => None,
                };
                if let Some(ch) = decoded {
                    out.push(ch);
                    i += semi + 1;
                    continue;
                }
            }
        }
        let ch = input[i..].chars().next().unwrap_or('\0');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

pub(crate) fn parse_toast_xml(xml: &str) -> (String, String) {
    let scope = match (xml.find("<visual"), xml.find("</visual>")) {
        (Some(start), Some(end)) if end > start => &xml[start..end],
        _ => xml,
    };

    let mut texts: Vec<String> = Vec::new();
    let mut cursor = 0;
    while let Some(rel) = scope[cursor..].find("<text") {
        let tag_start = cursor + rel;
        let after_kw = tag_start + 5;
        // Require `<text>` or `<text ...>` so we don't match unrelated `<textarea>`.
        let next_byte = scope.as_bytes().get(after_kw).copied();
        if !matches!(next_byte, Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n') | Some(b'/')) {
            cursor = after_kw;
            continue;
        }
        let Some(gt_rel) = scope[after_kw..].find('>') else { break };
        let gt_pos = after_kw + gt_rel;
        if gt_pos > tag_start && scope.as_bytes()[gt_pos - 1] == b'/' {
            cursor = gt_pos + 1;
            continue;
        }
        let content_start = gt_pos + 1;
        let Some(close_rel) = scope[content_start..].find("</text>") else { break };
        let raw_inner = &scope[content_start..content_start + close_rel];
        let cleaned = unescape_xml(raw_inner).trim().to_string();
        if !cleaned.is_empty() {
            texts.push(cleaned);
        }
        cursor = content_start + close_rel + 7;
    }

    if texts.is_empty() {
        return (String::new(), String::new());
    }
    let title = texts.remove(0);
    let body = texts.join("\n");
    (title, body)
}

pub(crate) fn fallback_app_name(aumid: &str) -> String {
    let trimmed = aumid.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let without_bang = trimmed.split('!').next().unwrap_or(trimmed);
    // Strip store package publisher suffix `_xxxxxxxxxxxxx`.
    let base = match without_bang.rfind('_') {
        Some(idx) if without_bang.len().saturating_sub(idx + 1) >= 10 => &without_bang[..idx],
        _ => without_bang,
    };
    let tail = base.rsplit('.').next().unwrap_or(base).trim();
    if tail.eq_ignore_ascii_case("desktop") || tail.eq_ignore_ascii_case("app") {
        let mut parts = base.rsplit('.').filter(|s| !s.is_empty());
        let _ = parts.next();
        parts.next().unwrap_or(tail).to_string()
    } else {
        tail.to_string()
    }
}

fn query_handler_display_name(db: &DbConn<'_>, handler_id: i64) -> Option<String> {
    if handler_id <= 0 {
        return None;
    }
    let stmt = db.prepare(
        "SELECT AssetValue FROM HandlerAssets WHERE HandlerId = ?1 AND AssetKey = 'DisplayName' LIMIT 1",
    ).ok()?;
    if stmt.bind_i64(1, handler_id) != SQLITE_OK {
        return None;
    }
    if stmt.step() == SQLITE_ROW {
        let val = stmt.col_text_lossy(0).trim().to_string();
        if !val.is_empty() {
            return Some(val);
        }
    }
    None
}

fn resolve_shell_display_name(primary_id: &str) -> Option<String> {
    let parsing_name = HSTRING::from(format!("shell:AppsFolder\\{primary_id}"));
    let item: IShellItem = unsafe { SHCreateItemFromParsingName(&parsing_name, None::<&IBindCtx>) }.ok()?;
    let pwstr = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }.ok()?;
    let name = unsafe { pwstr.to_string() }.ok().map(|s| s.trim().to_string());
    unsafe {
        CoTaskMemFree(Some(pwstr.0 as *const c_void));
    }
    name.filter(|s| !s.is_empty())
}

fn resolve_app_name(
    db: &DbConn<'_>,
    cache: &mut HashMap<String, String>,
    handler_id: i64,
    primary_id: &str,
) -> String {
    let trimmed = primary_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(cached) = cache.get(trimmed) {
        return cached.clone();
    }
    let resolved = query_handler_display_name(db, handler_id)
        .or_else(|| resolve_shell_display_name(trimmed))
        .unwrap_or_else(|| fallback_app_name(trimmed));
    if cache.len() > 512 {
        cache.clear();
    }
    cache.insert(trimmed.to_string(), resolved.clone());
    resolved
}

fn query_max_order(db: &DbConn<'_>) -> Result<i64, c_int> {
    let stmt = db.prepare("SELECT COALESCE(MAX(\"Order\"), 0) FROM Notification WHERE Type = 'toast'")?;
    let rc = stmt.step();
    if rc == SQLITE_ROW {
        Ok(stmt.col_i64(0))
    } else if rc == SQLITE_DONE {
        Ok(0)
    } else {
        Err(rc)
    }
}

fn query_toasts_after(db: &DbConn<'_>, after_order: i64) -> Result<Vec<RawToastRow>, c_int> {
    let stmt = db.prepare(
        "SELECT n.\"Order\", n.Id, n.ArrivalTime, n.HandlerId, COALESCE(h.PrimaryId, ''), n.Payload \
         FROM Notification n LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId \
         WHERE n.Type = 'toast' AND n.\"Order\" > ?1 ORDER BY n.\"Order\" ASC",
    )?;
    let bind_rc = stmt.bind_i64(1, after_order);
    if bind_rc != SQLITE_OK {
        return Err(bind_rc);
    }
    let mut rows = Vec::new();
    loop {
        match stmt.step() {
            SQLITE_ROW => {
                rows.push(RawToastRow {
                    order: stmt.col_i64(0),
                    id: stmt.col_i64(1).max(0) as u32,
                    arrival_filetime: stmt.col_i64(2),
                    handler_id: stmt.col_i64(3),
                    primary_id: stmt.col_text_lossy(4),
                    payload_xml: stmt.col_blob_utf8(5),
                });
            }
            SQLITE_DONE => break,
            rc => return Err(rc),
        }
    }
    Ok(rows)
}

pub(crate) fn try_run_wpn_watcher<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some((dir_path, db_path)) = wpndatabase_paths() else {
        return Err("LOCALAPPDATA missing".into());
    };
    if !db_path.exists() {
        return Err("wpndatabase.db not found".into());
    }
    let api = SqliteApi::load()?;
    let uri = path_to_sqlite_ro_uri(&db_path);
    let mut db = api
        .open_readonly(&uri)
        .map_err(|rc| format!("sqlite3_open_v2 rc={rc}"))?;
    let mut last_order = query_max_order(&db)
        .map_err(|rc| format!("initial query_max_order rc={rc}"))?;

    let dir_wide = HSTRING::from(dir_path.to_string_lossy().as_ref());
    let change_handle = unsafe {
        FindFirstChangeNotificationW(
            PCWSTR(dir_wide.as_ptr()),
            false,
            FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_SIZE,
        )
    }
    .ok()
    .filter(|h| *h != INVALID_HANDLE_VALUE && !h.is_invalid());
    let has_watch = change_handle.is_some();
    let _watch_guard = change_handle.map(ChangeWatchGuard);

    notification_diagnostic(
        app,
        &format!(
            "listener mode=wpndb change_watch={} poll_ms=150 seed_order={last_order}",
            has_watch
        ),
    );

    let mut seen: HashSet<(u32, i64)> = HashSet::new();
    let mut app_name_cache: HashMap<String, String> = HashMap::new();
    let mut consecutive_errors = 0usize;

    loop {
        if let Some(ref guard) = _watch_guard {
            let wait_rc = unsafe { WaitForSingleObject(guard.0, 150) };
            if wait_rc == WAIT_OBJECT_0 {
                unsafe {
                    let _ = FindNextChangeNotification(guard.0);
                }
            }
        } else {
            std::thread::sleep(Duration::from_millis(120));
        }

        let scan_started = Instant::now();
        match query_toasts_after(&db, last_order) {
            Ok(rows) => {
                let query_ms = scan_started.elapsed().as_millis();
                consecutive_errors = 0;
                for row in rows {
                    if row.order > last_order {
                        last_order = row.order;
                    }
                    let created_ms = filetime_to_unix_ms(row.arrival_filetime);
                    let key = (row.id, created_ms);
                    if seen.contains(&key) {
                        continue;
                    }
                    if seen.len() > 4096 {
                        seen.clear();
                    }
                    seen.insert(key);

                    let parse_started = Instant::now();
                    let app_name = resolve_app_name(
                        &db,
                        &mut app_name_cache,
                        row.handler_id,
                        &row.primary_id,
                    );
                    let (title, body) = parse_toast_xml(&row.payload_xml);
                    let ev = SystemNotificationEvent {
                        id: row.id,
                        app: app_name,
                        aumid: row.primary_id,
                        title,
                        body,
                        created_ms,
                    };
                    social_notifications::note_toast(&ev.app);
                    if !(ev.title.is_empty() && ev.body.is_empty() && ev.app.is_empty()) {
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as i64;
                        notification_diagnostic(
                            app,
                            &format!(
                                "detected source=wpndb age_ms={} scan_ms={} query_ms={} parse_ms={}",
                                now.saturating_sub(ev.created_ms).max(0),
                                scan_started.elapsed().as_millis(),
                                query_ms,
                                parse_started.elapsed().as_millis()
                            ),
                        );
                        let _ = app.emit("system-notification", ev);
                    }
                }
            }
            Err(rc) if rc == SQLITE_BUSY || rc == SQLITE_LOCKED => {
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(rc) => {
                consecutive_errors += 1;
                if consecutive_errors >= 5 {
                    drop(db);
                    match api.open_readonly(&uri) {
                        Ok(reopened) => {
                            db = reopened;
                            consecutive_errors = 0;
                        }
                        Err(open_rc) => {
                            return Err(format!("wpndb failed query rc={rc}, reopen rc={open_rc}"));
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_toast_generic_and_legacy_text_bindings_with_entities() {
        let xml_generic = "<toast><visual><binding template=\"ToastGeneric\"><text>Antigravity</text><text>Build &amp; Check &lt;OK&gt;</text></binding></visual></toast>";
        assert_eq!(
            parse_toast_xml(xml_generic),
            ("Antigravity".to_string(), "Build & Check <OK>".to_string())
        );

        let xml_text02 = "<toast><visual><binding template=\"ToastText02\"><text id=\"1\">任务已完成</text><text id=\"2\">第1行</text><text id=\"3\">第2行</text></binding></visual><actions><action content=\"忽略\"/></actions></toast>";
        assert_eq!(
            parse_toast_xml(xml_text02),
            ("任务已完成".to_string(), "第1行\n第2行".to_string())
        );
    }

    #[test]
    fn extracts_clean_fallback_names_from_aumid() {
        assert_eq!(fallback_app_name("electron.app.Antigravity"), "Antigravity");
        assert_eq!(
            fallback_app_name("Microsoft.ScreenSketch_8wekyb3d8bbwe!App"),
            "ScreenSketch"
        );
        assert_eq!(fallback_app_name("WorkBuddy.WorkBuddy"), "WorkBuddy");
    }

    #[test]
    fn encodes_sqlite_ro_uri_and_reads_local_wpndb_if_present() {
        assert_eq!(
            path_to_sqlite_ro_uri(Path::new(r"C:\Users\My Name\wpndatabase#1.db")),
            "file:///C:/Users/My%20Name/wpndatabase%231.db?mode=ro"
        );
        if let Some((_, db_path)) = wpndatabase_paths() {
            if db_path.exists() {
                let api = SqliteApi::load().expect("winsqlite3.dll should load");
                let conn = api
                    .open_readonly(&path_to_sqlite_ro_uri(&db_path))
                    .expect("wpndatabase should open read-only");
                let max_order = query_max_order(&conn).expect("MAX(Order) query should succeed");
                assert!(max_order >= 0);
            }
        }
    }
}
