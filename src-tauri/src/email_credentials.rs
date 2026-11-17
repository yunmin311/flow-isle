// Account-scoped Windows credentials. Never expose secrets to the webview.
pub(crate) fn write(target_name: &str, email: &str, password: &str, endpoint: &str) -> Result<(), String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target: Vec<u16> = target_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut user: Vec<u16> = email
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut blob = password.as_bytes().to_vec();
    let mut endpoint: Vec<u16> = endpoint.encode_utf16().chain([0]).collect();

    let credential = CREDENTIALW {
        Flags: Default::default(),
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        Comment: PWSTR(endpoint.as_mut_ptr()),
        LastWritten: Default::default(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: std::ptr::null_mut(),
        TargetAlias: PWSTR::null(),
        UserName: PWSTR(user.as_mut_ptr()),
    };

    unsafe { CredWriteW(&credential, 0) }.map_err(|_| "保存 Windows 凭据失败".into())
}

pub(crate) fn read(target_name: &str) -> Option<(String, String, String)> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target: Vec<u16> = target_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut credential_ptr: *mut CREDENTIALW = std::ptr::null_mut();
    if unsafe { CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None, &mut credential_ptr) }
        .is_err()
        || credential_ptr.is_null()
    {
        return None;
    }

    let credential = unsafe { &*credential_ptr };
    let user = if credential.UserName.is_null() {
        String::new()
    } else {
        unsafe { credential.UserName.to_string() }.unwrap_or_default()
    };
    let password = if credential.CredentialBlob.is_null() || credential.CredentialBlobSize == 0 {
        String::new()
    } else {
        let bytes = unsafe {
            std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            )
        };
        String::from_utf8_lossy(bytes).to_string()
    };
    let endpoint = if credential.Comment.is_null() {
        String::new()
    } else {
        unsafe { credential.Comment.to_string() }.unwrap_or_default()
    };
    unsafe { CredFree(credential_ptr as *const _) };
    Some((user, password, endpoint))
}

pub(crate) fn delete(target_name: &str) -> Result<(), String> {
    use windows::Win32::Foundation::ERROR_NOT_FOUND;
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    let target: Vec<u16> = target_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    match unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        Err(error) if error.code() == ERROR_NOT_FOUND.to_hresult() => Ok(()),
        Err(_) => Err("清除 Windows 凭据失败".into()),
    }
}


pub(crate) const LEGACY: &str = "FocusIsland/Email";
pub(crate) fn target(email: &str, endpoint: &str) -> String {
    use base64::Engine;
    format!("FocusIsland/Email/v2/{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(format!("{}\n{}", endpoint.to_ascii_lowercase(), email.trim().to_ascii_lowercase())))
}
fn legacy_matches(user: &str, saved: &str, email: &str, endpoint: &str) -> bool {
    if !user.eq_ignore_ascii_case(email.trim()) { return false; }
    let own = match email.rsplit_once('@').map(|(_, domain)| domain.to_ascii_lowercase()).as_deref() {
        Some("qq.com" | "foxmail.com") => "qq:imap.qq.com",
        Some("163.com") => "163:imap.163.com", Some("126.com") => "126:imap.126.com",
        Some("gmail.com" | "googlemail.com") => "gmail:imap.gmail.com",
        Some("outlook.com" | "hotmail.com" | "live.com") => "outlook:outlook.office365.com",
        _ => "",
    };
    saved == endpoint || (saved.is_empty() && !own.is_empty() && own == endpoint)
}
fn password_at(key: &str, legacy: &str, email: &str, endpoint: &str) -> Option<String> {
    let valid = |(user, password, saved): (String, String, String)| {
        (user.eq_ignore_ascii_case(email.trim()) && saved == endpoint && !password.is_empty()).then_some(password)
    };
    if let Some(entry) = read(key) { return valid(entry); }
    let (user, password, saved) = read(legacy)?;
    if !legacy_matches(&user, &saved, email, endpoint) || password.is_empty() { return None; }
    // Copy first, then verify; retain legacy until an explicit clear of this account.
    write(key, &user, &password, endpoint).ok()?;
    valid(read(key)?)
}
pub(crate) fn password(email: &str, endpoint: &str) -> Option<String> {
    password_at(&target(email, endpoint), LEGACY, email, endpoint)
}
fn clear_at(key: &str, legacy: &str, email: &str, endpoint: &str) -> Result<(), String> {
    if read(legacy).is_some_and(|(user, _, saved)| legacy_matches(&user, &saved, email, endpoint)) {
        delete(legacy)?;
    }
    delete(key)
}
pub(crate) fn clear(email: &str, endpoint: &str) -> Result<(), String> {
    clear_at(&target(email, endpoint), LEGACY, email, endpoint)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vault_accounts_are_isolated() {
        let prefix = format!("FlowIsle/Test/{}/", std::process::id());
        let a = format!("{prefix}A"); let b = format!("{prefix}B");
        struct Cleanup(Vec<String>);
        impl Drop for Cleanup { fn drop(&mut self) { for key in &self.0 { let _ = delete(key); } } }
        let _cleanup = Cleanup(vec![a.clone(), b.clone()]);
        write(&a, "one@example.invalid", "test-one", "qq:imap.qq.com").unwrap();
        write(&b, "two@example.invalid", "test-two", "163:imap.163.com").unwrap();
        assert_eq!(read(&a).unwrap().1, "test-one");
        assert_eq!(read(&b).unwrap().1, "test-two");
        delete(&a).unwrap(); assert!(read(&a).is_none());
        assert_eq!(read(&b).unwrap().1, "test-two");
    }
    #[test]
    fn legacy_copy_is_verified_and_clear_cannot_resurrect_it() {
        let prefix = format!("FlowIsle/Test/{}/migration/", std::process::id());
        let old = format!("{prefix}old"); let new = format!("{prefix}new");
        struct Cleanup(Vec<String>);
        impl Drop for Cleanup { fn drop(&mut self) { for key in &self.0 { let _ = delete(key); } } }
        let _cleanup = Cleanup(vec![old.clone(), new.clone()]);
        write(&old, "fixture-only@163.com", "test-code", "").unwrap();
        assert!(password_at(&new, &old, "fixture-only@163.com", "custom:untrusted.invalid").is_none());
        assert!(read(&new).is_none());
        assert_eq!(password_at(&new, &old, "fixture-only@163.com", "163:imap.163.com").as_deref(), Some("test-code"));
        assert!(read(&old).is_some());
        clear_at(&new, &old, "fixture-only@163.com", "163:imap.163.com").unwrap();
        assert!(read(&old).is_none()); assert!(read(&new).is_none());
        assert!(password_at(&new, &old, "fixture-only@163.com", "163:imap.163.com").is_none());
    }
    #[test]
    fn identity_binds_account_and_endpoint() {
        assert_eq!(target("ONE@example.invalid", "qq:imap.qq.com"), target("one@example.invalid", "qq:imap.qq.com"));
        assert_ne!(target("one@example.invalid", "qq:imap.qq.com"), target("two@example.invalid", "qq:imap.qq.com"));
        assert_ne!(target("one@example.invalid", "custom:imap.a.invalid"), target("one@example.invalid", "custom:imap.b.invalid"));
    }
}
