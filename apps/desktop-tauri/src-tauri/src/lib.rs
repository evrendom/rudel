mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::scan_machine,
            commands::scan_workspace,
            commands::detect_drift,
            commands::create_install_plan,
            commands::apply_install_plan,
            commands::get_drift_detail
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rudel desktop");
}
