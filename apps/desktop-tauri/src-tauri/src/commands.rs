use rudel_local::{
    apply_install_plan as apply_install_plan_local,
    create_install_plan as create_install_plan_local,
    detect_drift_from_input as detect_drift_local,
    get_drift_detail as get_drift_detail_local,
    scan_machine as scan_machine_local,
    scan_workspace as scan_workspace_local,
    ApplyInstallPlanInput, ApplyInstallPlanResult, CreateInstallPlanInput, DetectDriftInput,
    DriftDetail, DriftFinding, GetDriftDetailInput, InstallPlan, MachineScanResult,
    ScanMachineInput, ScanWorkspaceInput,
};

#[tauri::command]
pub async fn scan_machine(input: ScanMachineInput) -> Result<MachineScanResult, String> {
    run_blocking(move || Ok(scan_machine_local(input))).await
}

#[tauri::command]
pub async fn scan_workspace(input: ScanWorkspaceInput) -> Result<MachineScanResult, String> {
    run_blocking(move || Ok(scan_workspace_local(input))).await
}

#[tauri::command]
pub async fn detect_drift(input: DetectDriftInput) -> Result<Vec<DriftFinding>, String> {
    run_blocking(move || Ok(detect_drift_local(input))).await
}

#[tauri::command]
pub async fn create_install_plan(input: CreateInstallPlanInput) -> Result<InstallPlan, String> {
    run_blocking(move || Ok(create_install_plan_local(input))).await
}

#[tauri::command]
pub async fn apply_install_plan(
    input: ApplyInstallPlanInput,
) -> Result<ApplyInstallPlanResult, String> {
    run_blocking(move || apply_install_plan_local(input).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn get_drift_detail(input: GetDriftDetailInput) -> Result<DriftDetail, String> {
    run_blocking(move || Ok(get_drift_detail_local(input))).await
}

async fn run_blocking<T, TWork>(work: TWork) -> Result<T, String>
where
    T: Send + 'static,
    TWork: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}
