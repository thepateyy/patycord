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
// src-tauri/game-names.json and scripts/update-game-names.js) — an allowlist rather than
// a denylist of obvious non-games, so random unrecognized apps never show up as
// "playing" by accident. Embedded at compile time, so regenerating that JSON needs
// a rebuild to take effect. Maps exe stem -> display name; the display name is
// what gets emitted, so the frontend never has to load its own copy of the list.
#[cfg(target_os = "windows")]
fn known_games() -> &'static std::collections::HashMap<String, String> {
    static GAMES: std::sync::OnceLock<std::collections::HashMap<String, String>> = std::sync::OnceLock::new();
    GAMES.get_or_init(|| {
        let raw = include_str!("../game-names.json");
        serde_json::from_str(raw).unwrap_or_default()
    })
}

// Off whenever the user has "Share what I'm playing" turned off — no point
// snapshotting every running process every few seconds for a result nobody
// will see. The frontend sets it on startup and whenever the toggle changes.
#[cfg(target_os = "windows")]
static ACTIVITY_DETECTION_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn set_activity_detection(enabled: bool) {
    #[cfg(target_os = "windows")]
    ACTIVITY_DETECTION_ENABLED.store(enabled, std::sync::atomic::Ordering::Relaxed);
    #[cfg(not(target_os = "windows"))]
    let _ = enabled;
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

// The first running process (lowercase exe stem, no .exe) that `is_match` accepts —
// a snapshot via the same lightweight API Task Manager itself uses, no per-process
// handles opened (unlike foreground_process_name, which needs one to resolve the
// full path). Stops at the first hit instead of collecting every name first.
#[cfg(target_os = "windows")]
fn find_running_process(is_match: impl Fn(&str) -> bool) -> Option<String> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut found = None;
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut name = String::new(); // reused across entries rather than allocating one per process
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                name.clear();
                name.extend(char::decode_utf16(entry.szExeFile[..len].iter().copied()).map(|c| c.unwrap_or('\u{FFFD}')));
                name.make_ascii_lowercase();
                let stem = name.strip_suffix(".exe").unwrap_or(&name);
                if !stem.is_empty() && is_match(stem) {
                    found = Some(stem.to_string());
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = windows::Win32::Foundation::CloseHandle(snapshot);
    }
    found
}

// The display name of whichever known game is running, if any.
#[cfg(target_os = "windows")]
fn detect_running_game() -> Option<String> {
    let games = known_games();

    // Prefer whatever's actually focused, if it happens to be a known game — avoids
    // ties when several are open at once (e.g. a launcher plus the game itself).
    let exe = foreground_process_name()
        .filter(|fg| games.contains_key(fg))
        // Otherwise scan everything running, so a minimized or alt-tabbed-away-from
        // game still counts.
        .or_else(|| find_running_process(|name| games.contains_key(name)))?;
    games.get(&exe).cloned()
}

// Push-to-talk: watches one key (or mouse button) system-wide and emits
// "ptt-changed" with whether it's held. Reads the key's state with
// GetAsyncKeyState rather than registering a global hotkey — RegisterHotKey would
// swallow the key, so a push-to-talk key bound to something a game also uses
// would stop working in the game. Only polls while the frontend has set a key,
// which it does only during a call with push-to-talk on; otherwise the thread is
// parked and costs nothing.
#[cfg(target_os = "windows")]
mod push_to_talk {
    use std::sync::atomic::{AtomicU16, Ordering};
    use std::sync::OnceLock;
    use tauri::Emitter;

    static KEY: AtomicU16 = AtomicU16::new(0); // Windows virtual-key code; 0 = off
    static THREAD: OnceLock<std::thread::Thread> = OnceLock::new();

    pub fn start(app: tauri::AppHandle) {
        let handle = std::thread::spawn(move || {
            use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
            let mut held = false;
            loop {
                let vk = KEY.load(Ordering::Relaxed);
                let now_held = vk != 0 && unsafe { GetAsyncKeyState(vk as i32) } < 0; // high bit = currently down
                if now_held != held {
                    held = now_held;
                    let _ = app.emit("ptt-changed", held);
                }
                if vk == 0 {
                    std::thread::park(); // until set_push_to_talk_key wakes us
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(15));
                }
            }
        });
        let _ = THREAD.set(handle.thread().clone());
    }

    pub fn set_key(vk: u16) {
        KEY.store(vk, Ordering::Relaxed);
        if let Some(thread) = THREAD.get() {
            thread.unpark();
        }
    }
}

#[tauri::command]
fn set_push_to_talk_key(vk: u16) {
    #[cfg(target_os = "windows")]
    push_to_talk::set_key(vk);
    #[cfg(not(target_os = "windows"))]
    let _ = vk;
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

// --- tray --------------------------------------------------------------
// Everything in patycord is peer-to-peer, so you're only reachable while it's
// running: closing the window hides it to the tray instead of quitting (unless
// turned off in settings), and Quit lives in the tray icon's menu.

static CLOSE_TO_TRAY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

// Passed by the start-with-Windows entry, so a launch at sign-in goes straight to the tray.
const STARTED_HIDDEN_ARG: &str = "--hidden";

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// The menu's items, kept so the frontend can relabel them in the current language.
struct TrayMenu {
    open: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let open = MenuItem::with_id(app, "open", "Open patycord", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit patycord", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("patycord")
        .menu(&menu)
        .show_menu_on_left_click(false) // left click opens the window; the menu is on right click
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(TrayMenu { open, quit });
    Ok(())
}

#[tauri::command]
fn set_tray_labels(menu: tauri::State<'_, TrayMenu>, open: String, quit: String) {
    let _ = menu.open.set_text(open);
    let _ = menu.quit.set_text(quit);
}

// --- getting your attention -----------------------------------------------

// A Windows notification. The frontend only sends these while the window isn't
// focused — in-app toasts cover the rest.
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

// Flashes the taskbar button until the window is focused (or stops flashing).
// Hidden in the tray there's no taskbar button to flash, so for an incoming call
// the window is first put back minimized — without activating it, so a
// fullscreen game doesn't lose focus.
#[tauri::command]
fn request_attention(app: tauri::AppHandle, urgent: bool) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else { return };
    if !urgent {
        let _ = window.request_user_attention(None);
        return;
    }
    #[cfg(target_os = "windows")]
    if !window.is_visible().unwrap_or(true) {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWMINNOACTIVE};
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let _ = ShowWindow(windows::Win32::Foundation::HWND(hwnd.0 as _), SW_SHOWMINNOACTIVE);
            }
        }
    }
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
}

// Opens a link from a chat message in the default browser. Only http(s), and
// the URL reaches explorer.exe as a plain argument — never through a shell —
// so nothing in it can be run as a command.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    let is_web = lower.starts_with("https://") || lower.starts_with("http://");
    if !is_web || url.len() > 2048 || url.chars().any(|c| c.is_control() || c == '"' || c.is_whitespace()) {
        return Err("not a web link".into());
    }
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe").arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first. A second launch (from the Start menu, say, while
        // we're sitting in the tray) would otherwise start another copy under the
        // same peer ID, which the signaling server rejects — instead it just brings
        // this one back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_autostart::Builder::new().arg(STARTED_HIDDEN_ARG).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            secure_store::load_secure_store,
            secure_store::save_secure_store,
            set_activity_detection,
            set_push_to_talk_key,
            set_close_to_tray,
            set_tray_labels,
            notify,
            request_attention,
            open_url
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|_app| {
            create_tray(_app)?;
            {
                use tauri::Manager;
                // The window starts hidden (tauri.conf.json) so a launch at sign-in
                // never flashes it up before going to the tray.
                if !std::env::args().any(|arg| arg == STARTED_HIDDEN_ARG) {
                    if let Some(window) = _app.get_webview_window("main") {
                        let _ = window.show();
                    }
                }
            }
            #[cfg(target_os = "windows")]
            {
                use tauri::{Emitter, Manager};
                let window = _app.get_webview_window("main").expect("no main window");
                allow_mic_permission(&window);
                push_to_talk::start(_app.handle().clone());

                let app_handle = _app.handle().clone();
                std::thread::spawn(move || {
                    let mut last: Option<String> = None;
                    loop {
                        let current = if ACTIVITY_DETECTION_ENABLED.load(std::sync::atomic::Ordering::Relaxed) {
                            detect_running_game()
                        } else {
                            None
                        };
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
