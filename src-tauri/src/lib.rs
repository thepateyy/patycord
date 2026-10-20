#[cfg(target_os = "windows")]
fn allow_mic_permission(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    // Scoped to patycord's own origin so this can never silently hand mic access to
    // anything else that might end up loaded in this webview — there's no in-app
    // navigation today (no <a href>, no window.open, CSP has no room for it either),
    // so this is currently equivalent to "always", but that's the point: a future
    // change that *does* introduce navigation can't quietly inherit mic access just
    // by sharing this window. Falls back to the old always-allow behavior if the
    // window's own URL can't be read for some reason, rather than breaking mic
    // access entirely over an edge case that shouldn't happen.
    let own_origin = window.url().ok().map(|u| u.origin());

    let _ = window.with_webview(move |webview| unsafe {
        let core_webview = webview.controller().CoreWebView2().expect("no CoreWebView2");
        let mut token: i64 = 0;
        let handler = PermissionRequestedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = Default::default();
            args.PermissionKind(&mut kind)?;
            if kind != COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                return Ok(());
            }
            let mut uri = Default::default();
            args.Uri(&mut uri)?;
            let uri = webview2_com::take_pwstr(uri);
            let same_origin = match (&own_origin, tauri::Url::parse(&uri)) {
                (Some(expected), Ok(requested)) => requested.origin() == *expected,
                _ => true, // couldn't determine one side or the other — fail open, same as before this change
            };
            if same_origin {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        }));
        core_webview
            .add_PermissionRequested(&handler, &mut token)
            .expect("failed to register permission handler");
    });
}

// "What are you playing" detection: is a known game currently running, focused or
// not. "Known" means present in Discord's own detectable-applications list (see
// ui/game-names.json and scripts/update-game-names.js) — an allowlist rather than
// a denylist of obvious non-games, so random unrecognized apps never show up as
// "playing" by accident. Embedded at compile time, so regenerating that JSON needs
// a rebuild to take effect here (the frontend picks it up immediately either way).
#[cfg(target_os = "windows")]
fn known_games() -> &'static std::collections::HashSet<String> {
    static GAMES: std::sync::OnceLock<std::collections::HashSet<String>> = std::sync::OnceLock::new();
    GAMES.get_or_init(|| {
        let raw = include_str!("../../ui/game-names.json");
        let map: std::collections::HashMap<String, String> = serde_json::from_str(raw).unwrap_or_default();
        map.into_keys().collect()
    })
}

#[cfg(target_os = "windows")]
fn foreground_process_name() -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows::core::PWSTR;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        ok.ok()?;

        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let filename = path.rsplit(['\\', '/']).next()?;
        let name = filename.strip_suffix(".exe").unwrap_or(filename);
        if name.is_empty() { None } else { Some(name.to_lowercase()) }
    }
}

// All currently running processes' executable names (lowercase, no .exe) — a
// snapshot via the same lightweight API Task Manager itself uses, no per-process
// handles opened (unlike foreground_process_name, which needs one to resolve the
// full path).
#[cfg(target_os = "windows")]
fn running_process_names() -> Vec<String> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut names = Vec::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return names;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let filename = String::from_utf16_lossy(&entry.szExeFile[..len]);
                let stem = filename.strip_suffix(".exe").unwrap_or(&filename);
                if !stem.is_empty() {
                    names.push(stem.to_lowercase());
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = windows::Win32::Foundation::CloseHandle(snapshot);
    }
    names
}

#[cfg(target_os = "windows")]
fn detect_running_game() -> Option<String> {
    let games = known_games();

    // Prefer whatever's actually focused, if it happens to be a known game — avoids
    // ties when several are open at once (e.g. a launcher plus the game itself).
    if let Some(fg) = foreground_process_name() {
        if games.contains(&fg) {
            return Some(fg);
        }
    }

    // Otherwise scan everything running, so a minimized or alt-tabbed-away-from
    // game still counts.
    running_process_names().into_iter().find(|name| games.contains(name))
}

// A single encrypted-at-rest blob (one JSON object holding friends, chat history,
// pending messages, persistent ID — everything the frontend used to keep in plain
// localStorage) instead of per-key values, so there's one load and one save call
// instead of wiring every localStorage.getItem/setItem through IPC individually.
// Encrypted with Windows DPAPI (CryptProtectData/CryptUnprotectData), which ties
// the key to the current Windows user account — something with same-user file
// access but a different identity (or the file copied elsewhere) can't decrypt it,
// unlike an XOR/"obfuscation" scheme whose key would have to live right next to
// the data it protects.
#[cfg(target_os = "windows")]
mod secure_store {
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir.join("secure_store.bin"))
    }

    // Previous good copy, kept so a single bad write isn't terminal, and the
    // scratch file a save is staged through before being renamed into place.
    fn backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        Ok(store_path(app)?.with_extension("bak"))
    }

    fn temp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        Ok(store_path(app)?.with_extension("tmp"))
    }

    // Saves have to be serialized against each other: the rename dance below is a
    // multi-step read-modify-write of the same three paths, and Tauri dispatches
    // commands on a thread pool, so two concurrent saves could otherwise interleave
    // and leave the backup or the live file pointing at the wrong generation.
    static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::{HLOCAL, LocalFree};
        use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData};
        use windows::core::PCWSTR;
        unsafe {
            let mut input = plaintext.to_vec();
            let blob_in = CRYPT_INTEGER_BLOB { cbData: input.len() as u32, pbData: input.as_mut_ptr() };
            let mut blob_out = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(&blob_in, PCWSTR::null(), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut blob_out)
                .map_err(|e| e.to_string())?;
            let result = std::slice::from_raw_parts(blob_out.pbData, blob_out.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(blob_out.pbData as *mut _)));
            Ok(result)
        }
    }

    fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::{HLOCAL, LocalFree};
        use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData};
        unsafe {
            let mut input = ciphertext.to_vec();
            let blob_in = CRYPT_INTEGER_BLOB { cbData: input.len() as u32, pbData: input.as_mut_ptr() };
            let mut blob_out = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(&blob_in, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut blob_out)
                .map_err(|e| e.to_string())?;
            let result = std::slice::from_raw_parts(blob_out.pbData, blob_out.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(blob_out.pbData as *mut _)));
            Ok(result)
        }
    }

    fn read_and_decrypt(path: &std::path::Path) -> Result<String, String> {
        let ciphertext = fs::read(path).map_err(|e| e.to_string())?;
        let plaintext = unprotect(&ciphertext)?;
        String::from_utf8(plaintext).map_err(|e| e.to_string())
    }

    // Ok("{}") means "nothing saved yet" and Err means "there is a store, we just
    // can't read it" — the frontend must be able to tell those apart, because the
    // second case has to leave the file alone rather than overwrite it with a
    // fresh empty store (see initSecureStore).
    //
    // Split from the command itself so the tests below can exercise it against
    // real files: this is the path where a mistake silently destroys someone's
    // identity, friends list and entire chat history, so it's worth proving rather
    // than eyeballing.
    fn load_from(path: &std::path::Path, backup: &std::path::Path) -> Result<String, String> {
        if !path.exists() && !backup.exists() {
            return Ok("{}".to_string()); // genuine first run
        }
        // Prefer the live file, falling back to the previous good copy if it's
        // missing or won't decrypt. Only when both fail is this a real error.
        match read_and_decrypt(path) {
            Ok(data) => Ok(data),
            Err(primary) => read_and_decrypt(backup)
                .map_err(|backup_err| format!("main: {primary}; backup: {backup_err}")),
        }
    }

    fn save_to(
        path: &std::path::Path,
        backup: &std::path::Path,
        temp: &std::path::Path,
        data: &str,
    ) -> Result<(), String> {
        let ciphertext = protect(data.as_bytes())?;

        let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;

        // Stage to a scratch file and rename into place, so an interrupted save can
        // only ever leave the old blob or the new one — never a half-written one,
        // which DPAPI refuses to decrypt outright. fs::write truncated the live file
        // in place, so a crash mid-write used to be unrecoverable.
        fs::write(temp, &ciphertext).map_err(|e| e.to_string())?;
        if path.exists() {
            // Windows rename won't overwrite, hence clearing the old backup first.
            let _ = fs::remove_file(backup);
            fs::rename(path, backup).map_err(|e| e.to_string())?;
        }
        fs::rename(temp, path).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn load_secure_store(app: tauri::AppHandle) -> Result<String, String> {
        load_from(&store_path(&app)?, &backup_path(&app)?)
    }

    #[tauri::command]
    pub fn save_secure_store(app: tauri::AppHandle, data: String) -> Result<(), String> {
        save_to(
            &store_path(&app)?,
            &backup_path(&app)?,
            &temp_path(&app)?,
            &data,
        )
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        struct Paths {
            dir: PathBuf,
            main: PathBuf,
            backup: PathBuf,
            temp: PathBuf,
        }

        impl Paths {
            fn new(label: &str) -> Self {
                let dir = std::env::temp_dir().join(format!("patycord-store-test-{label}"));
                let _ = fs::remove_dir_all(&dir);
                fs::create_dir_all(&dir).unwrap();
                Self {
                    main: dir.join("secure_store.bin"),
                    backup: dir.join("secure_store.bak"),
                    temp: dir.join("secure_store.tmp"),
                    dir,
                }
            }
            fn load(&self) -> Result<String, String> {
                load_from(&self.main, &self.backup)
            }
            fn save(&self, data: &str) -> Result<(), String> {
                save_to(&self.main, &self.backup, &self.temp, data)
            }
        }

        impl Drop for Paths {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.dir);
            }
        }

        #[test]
        fn empty_dir_is_a_first_run_not_an_error() {
            let p = Paths::new("first-run");
            assert_eq!(p.load().unwrap(), "{}");
        }

        #[test]
        fn round_trips_and_leaves_no_scratch_file_behind() {
            let p = Paths::new("round-trip");
            p.save(r#"{"myId":"p-1"}"#).unwrap();
            assert_eq!(p.load().unwrap(), r#"{"myId":"p-1"}"#);
            assert!(!p.temp.exists(), "scratch file should be renamed away, not left behind");
        }

        #[test]
        fn a_truncated_live_file_falls_back_to_the_backup() {
            let p = Paths::new("truncated");
            p.save(r#"{"friends":["a"]}"#).unwrap(); // generation 1
            p.save(r#"{"friends":["a","b"]}"#).unwrap(); // generation 2, gen 1 becomes the backup

            // Simulate a crash partway through a write: DPAPI refuses to decrypt a
            // partial blob, which is exactly the case that used to reset the app.
            let whole = fs::read(&p.main).unwrap();
            fs::write(&p.main, &whole[..whole.len() / 2]).unwrap();

            assert_eq!(
                p.load().unwrap(),
                r#"{"friends":["a"]}"#,
                "should recover the previous generation instead of reporting a fresh store"
            );
        }

        #[test]
        fn both_copies_unreadable_is_an_error_never_an_empty_store() {
            let p = Paths::new("both-bad");
            p.save("{\"a\":1}").unwrap();
            p.save("{\"a\":2}").unwrap();
            fs::write(&p.main, b"garbage").unwrap();
            fs::write(&p.backup, b"garbage").unwrap();

            // The frontend keys off Err to go read-only; returning Ok("{}") here is
            // what made a transient failure destroy the store permanently.
            assert!(p.load().is_err());
        }

        #[test]
        fn concurrent_saves_leave_a_readable_store() {
            let p = Paths::new("concurrent");
            p.save(r#"{"gen":0}"#).unwrap();
            let (main, backup, temp) = (&p.main, &p.backup, &p.temp);
            std::thread::scope(|scope| {
                for i in 1..=8 {
                    scope.spawn(move || {
                        let _ = save_to(main, backup, temp, &format!(r#"{{"gen":{i}}}"#));
                    });
                }
            });
            // Whichever generation wins, the file must still decrypt to valid JSON —
            // the rename dance touches three paths and would interleave without the
            // lock.
            let loaded = p.load().unwrap();
            assert!(loaded.starts_with(r#"{"gen":"#), "got {loaded:?}");
        }
    }
}

// Non-Windows stand-in so the commands still exist to register (patycord doesn't
// currently ship for anything but Windows — see the rest of this file's native
// integrations — but this keeps a build from that platform merely *not
// persisting* instead of failing to compile).
#[cfg(not(target_os = "windows"))]
mod secure_store {
    #[tauri::command]
    pub fn load_secure_store(_app: tauri::AppHandle) -> Result<String, String> {
        Ok("{}".to_string())
    }

    #[tauri::command]
    pub fn save_secure_store(_app: tauri::AppHandle, _data: String) -> Result<(), String> {
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            secure_store::load_secure_store,
            secure_store::save_secure_store
        ])
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::{Emitter, Manager};
                let window = _app.get_webview_window("main").expect("no main window");
                allow_mic_permission(&window);

                let app_handle = _app.handle().clone();
                std::thread::spawn(move || {
                    let mut last: Option<String> = None;
                    loop {
                        let current = detect_running_game();
                        if current != last {
                            last = current.clone();
                            let _ = app_handle.emit("active-app-changed", current);
                        }
                        std::thread::sleep(std::time::Duration::from_secs(3));
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running patycord");
}
