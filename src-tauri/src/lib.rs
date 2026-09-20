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

// Best-effort "what are you playing" detection: whichever window currently has OS
// focus, by process name. No curated game database — just a denylist of obvious
// non-games (shell chrome, browsers, chat apps, dev tools, patycord itself) so the
// status isn't constantly "Playing chrome" or "Playing explorer".
#[cfg(target_os = "windows")]
const IGNORED_PROCESSES: &[&str] = &[
    "patycord",
    "explorer", "dwm", "lockapp", "searchhost", "searchapp", "startmenuexperiencehost",
    "shellexperiencehost", "applicationframehost", "textinputhost", "sihost",
    "systemsettings", "widgets", "taskmgr",
    "chrome", "msedge", "firefox", "brave", "opera", "iexplore",
    "discord", "slack", "teams", "zoom", "skype", "telegram", "whatsapp",
    "code", "devenv", "idea64", "pycharm64", "notepad", "notepad++",
    "winword", "excel", "powerpnt", "outlook", "onenote", "acrobat",
    "cmd", "powershell", "pwsh", "windowsterminal", "conhost",
    "spotify", "vlc",
];

#[cfg(target_os = "windows")]
fn active_window_process_name() -> Option<String> {
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
        if name.is_empty() || IGNORED_PROCESSES.contains(&name.to_lowercase().as_str()) {
            return None;
        }
        Some(name.to_string())
    }
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
                        let current = active_window_process_name();
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
