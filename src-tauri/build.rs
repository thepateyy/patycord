fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["load_secure_store", "save_secure_store"]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
