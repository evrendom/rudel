use rudel_local::{
    apply_write_plan as apply_write_plan_local, create_write_plan as create_write_plan_local,
    get_git_diff as get_git_diff_local, hash_files as hash_files_local,
    normalize_git_remotes as normalize_git_remotes_local, read_lockfiles as read_lockfiles_local,
    scan_machine as scan_machine_local, scan_machine_streaming as scan_machine_streaming_local,
    scan_workspace as scan_workspace_local, suggest_scan_roots as suggest_scan_roots_local,
    ApplyWritePlanInput, ApplyWritePlanResult, CreateWritePlanInput, GitDiffInput, GitDiffResult,
    HashFilesInput, HashFilesResult, LockfileReadResult, MachineScanResult,
    NormalizeGitRemotesInput, ReadLockfilesInput, RepoIdentityResult, ScanMachineInput,
    ScanRootSuggestionsResult, ScanWorkspaceInput, SkillArtifact, WritePlan,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const SKILL_INVENTORY_EVENT: &str = "rudel-skill-inventory";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillInventoryStreamEvent {
    scan_id: String,
    #[serde(flatten)]
    event: SkillInventoryStreamEventKind,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SkillInventoryStreamEventKind {
    Skill { artifact: SkillArtifact },
    Done { result: MachineScanResult },
}

#[tauri::command]
pub async fn suggest_scan_roots() -> Result<ScanRootSuggestionsResult, String> {
    run_blocking(move || Ok(suggest_scan_roots_local())).await
}

#[tauri::command]
pub async fn scan_machine(input: ScanMachineInput) -> Result<MachineScanResult, String> {
    run_blocking(move || Ok(scan_machine_local(input))).await
}

#[tauri::command]
pub async fn stream_skill_inventory(
    app: AppHandle,
    scan_id: String,
    input: ScanMachineInput,
) -> Result<(), String> {
    run_blocking(move || {
        let skill_event_app = app.clone();
        let skill_event_scan_id = scan_id.clone();
        let result = scan_machine_streaming_local(input, move |artifact| {
            let _ = skill_event_app.emit(
                SKILL_INVENTORY_EVENT,
                SkillInventoryStreamEvent {
                    scan_id: skill_event_scan_id.clone(),
                    event: SkillInventoryStreamEventKind::Skill {
                        artifact: artifact.clone(),
                    },
                },
            );
        });

        app.emit(
            SKILL_INVENTORY_EVENT,
            SkillInventoryStreamEvent {
                scan_id,
                event: SkillInventoryStreamEventKind::Done { result },
            },
        )
        .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn scan_workspace(input: ScanWorkspaceInput) -> Result<MachineScanResult, String> {
    run_blocking(move || Ok(scan_workspace_local(input))).await
}

#[tauri::command]
pub async fn read_lockfiles(input: ReadLockfilesInput) -> Result<LockfileReadResult, String> {
    run_blocking(move || Ok(read_lockfiles_local(input))).await
}

#[tauri::command]
pub async fn hash_files(input: HashFilesInput) -> Result<HashFilesResult, String> {
    run_blocking(move || Ok(hash_files_local(input))).await
}

#[tauri::command]
pub async fn normalize_git_remotes(
    input: NormalizeGitRemotesInput,
) -> Result<RepoIdentityResult, String> {
    run_blocking(move || Ok(normalize_git_remotes_local(input))).await
}

#[tauri::command]
pub async fn create_write_plan(input: CreateWritePlanInput) -> Result<WritePlan, String> {
    run_blocking(move || Ok(create_write_plan_local(input))).await
}

#[tauri::command]
pub async fn apply_write_plan(input: ApplyWritePlanInput) -> Result<ApplyWritePlanResult, String> {
    run_blocking(move || apply_write_plan_local(input).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn get_git_diff(input: GitDiffInput) -> Result<GitDiffResult, String> {
    run_blocking(move || Ok(get_git_diff_local(input))).await
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
