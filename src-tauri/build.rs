fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["load_secure_store", "save_secure_store", "set_activity_detection", "set_push_to_talk_key"]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
