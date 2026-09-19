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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                let window = _app.get_webview_window("main").expect("no main window");
                allow_mic_permission(&window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running patycord");
}
