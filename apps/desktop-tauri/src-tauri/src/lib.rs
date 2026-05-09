mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::scan_machine,
            commands::scan_workspace,
            commands::read_lockfiles,
            commands::hash_files,
            commands::normalize_git_remotes,
            commands::create_write_plan,
            commands::apply_write_plan,
            commands::get_git_diff
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rudel desktop");
}
