#[cfg(target_os = "windows")]
fn allow_mic_permission(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let _ = window.with_webview(|webview| unsafe {
        let core_webview = webview.controller().CoreWebView2().expect("no CoreWebView2");
        let mut token: i64 = 0;
        let handler = PermissionRequestedEventHandler::create(Box::new(|_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = Default::default();
            args.PermissionKind(&mut kind)?;
            if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
