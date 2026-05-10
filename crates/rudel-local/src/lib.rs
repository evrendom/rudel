use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::{DirEntry, WalkBuilder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PRODUCT_RULE: &str = "Desktop edits skills. Rust writes files. Cloud syncs teams.";
pub const LOCKFILE_PATH: &str = ".rudel/skills.lock.json";
pub const MAX_SCANNED_FILE_BYTES: u64 = 1_048_576;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".cache",
    "vendor",
    "coverage",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanWorkspaceInput {
    pub root_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanMachineInput {
    pub roots: Vec<String>,
    pub selection: ScanSelection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSelection {
    pub profiles: ScanSelectionProfiles,
    pub include_globs: Vec<String>,
    pub excluded_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSelectionProfiles {
    pub agent_skills: bool,
    pub cursor_rules: bool,
    pub repo_context: bool,
    pub global_agent_roots: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineScanResult {
    pub roots: Vec<ScannedRoot>,
    pub repos: Vec<CodeRepo>,
    pub candidates: Vec<ScanFileCandidate>,
    pub artifacts: Vec<SkillArtifact>,
    pub warnings: Vec<ScanWarning>,
    pub skipped_directory_count: usize,
    pub scanned_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedRoot {
    pub input: String,
    pub normalized_path: Option<String>,
    pub status: ScannedRootStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScannedRootStatus {
    Scanned,
    Missing,
    Unreadable,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeRepo {
    pub repo_root_path: String,
    pub repo_key: RepoKey,
    pub source_root: String,
    pub git_common_dir: Option<String>,
    pub branch_name: Option<String>,
    pub local_branch_count: usize,
    pub head_sha: Option<String>,
    pub is_dirty: bool,
    pub skill_file_count: usize,
    pub dirty_skill_file_count: usize,
    pub is_worktree: bool,
    pub is_nested: bool,
    pub has_rudel_lockfile: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    pub root: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFileCandidate {
    pub path: String,
    pub repo_root_path: Option<String>,
    pub source_scope: SourceScope,
    pub matched_by: ScanFileMatchedBy,
    pub selected: bool,
    pub size_bytes: u64,
    pub skipped_reason: Option<ScanFileSkippedReason>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanFileMatchedBy {
    AgentSkills,
    CursorRules,
    RepoContext,
    GlobalAgentRoots,
    IncludeGlob,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanFileSkippedReason {
    Excluded,
    Binary,
    TooLarge,
    InvalidGlob,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRootSuggestion {
    pub label: String,
    pub path: String,
    pub normalized_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRootSuggestionsResult {
    pub suggestions: Vec<ScanRootSuggestion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillArtifact {
    pub id: String,
    pub source_scope: SourceScope,
    pub artifact_target: ArtifactTarget,
    pub absolute_path_hash: String,
    pub path: String,
    pub repo_root_path: Option<String>,
    pub repo_relative_path: Option<String>,
    pub repo_key: Option<RepoKey>,
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symlink_kind: Option<SymlinkKind>,
    pub content: String,
    pub content_hash: String,
    pub normalized_content_hash: String,
    pub lockfile_entry: Option<SkillLockfileEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceScope {
    Repo,
    GlobalUser,
    NestedRepo,
    Symlink,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymlinkKind {
    File,
    SkillFolder,
    AgentRoot,
    AncestorFolder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactTarget {
    ClaudeCode,
    Codex,
    Cursor,
    AgentsMd,
    ClaudeMd,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RepoKey {
    Github(String),
    Local(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockfileStatus {
    Current,
    Behind,
    Modified,
    Missing,
    Conflict,
    Forked,
    Unmanaged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLockfile {
    pub version: u8,
    pub entries: Vec<SkillLockfileEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLockfileEntry {
    pub blueprint_id: String,
    pub blueprint_version: String,
    pub repo_overlay_hash: String,
    pub generated_hash: String,
    pub current_file_hash: Option<String>,
    pub artifact_target: ArtifactTarget,
    pub target_path: String,
    pub schema_version: String,
    pub compiler_version: String,
    pub status: LockfileStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedArtifact {
    pub artifact_target: ArtifactTarget,
    pub target_path: String,
    pub content: String,
    pub content_hash: String,
    pub blueprint_id: String,
    pub blueprint_version_id: String,
    pub overlay_hash: String,
    pub schema_version: String,
    pub compiler_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLockfilesInput {
    pub repo_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockfileReadResult {
    pub repos: Vec<LockfileReadRepo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockfileReadRepo {
    pub repo_path: String,
    pub lockfile: Option<SkillLockfile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashFilesInput {
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashFilesResult {
    pub files: Vec<FileHashResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHashResult {
    pub path: String,
    pub normalized_content_hash: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeGitRemotesInput {
    pub repo_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoIdentityResult {
    pub repos: Vec<RepoIdentity>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoIdentity {
    pub repo_path: String,
    pub repo_key: Option<RepoKey>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWritePlanInput {
    pub repo_id: String,
    pub repo_path: String,
    pub artifacts: Vec<GeneratedArtifact>,
    pub lockfile_updates: Vec<SkillLockfileEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePlan {
    pub id: String,
    pub repo_id: String,
    pub blueprint_id: String,
    pub files: Vec<WritePlanFile>,
    pub undo_available: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePlanFile {
    pub target_path: String,
    pub action: WritePlanAction,
    pub generated_content: String,
    pub diff: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WritePlanAction {
    Create,
    Modify,
    Skip,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyWritePlanInput {
    pub repo_path: String,
    pub plan: WritePlan,
    pub lockfile_updates: Vec<SkillLockfileEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyWritePlanResult {
    pub operation_id: String,
    pub applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffInput {
    pub repo_path: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub repo_path: String,
    pub diff: String,
    pub error: Option<String>,
}

pub fn shell_boundary() -> &'static str {
    "Tauri is the first shell, not the architecture."
}

pub fn scan_workspace(input: ScanWorkspaceInput) -> MachineScanResult {
    scan_machine(ScanMachineInput {
        roots: vec![input.root_path],
        selection: default_scan_selection(),
    })
}

pub fn suggest_scan_roots() -> ScanRootSuggestionsResult {
    let Some(home) = home_dir() else {
        return ScanRootSuggestionsResult {
            suggestions: Vec::new(),
        };
    };
    let candidates = [
        ("Code", "Code"),
        ("Developer", "Developer"),
        ("Projects", "Projects"),
        ("GitHub", "Documents/GitHub"),
        ("Conductor workspaces", "conductor/workspaces"),
    ];
    let mut suggestions = candidates
        .iter()
        .filter_map(|(label, relative_path)| {
            let path = home.join(relative_path);
            if !path.is_dir() {
                return None;
            }
            let normalized = fs::canonicalize(&path).ok()?;
            Some(ScanRootSuggestion {
                label: (*label).to_string(),
                path: format!("~/{}", relative_path),
                normalized_path: normalize_absolute_path(&normalized),
            })
        })
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| left.normalized_path.cmp(&right.normalized_path));

    ScanRootSuggestionsResult { suggestions }
}

pub fn scan_machine(input: ScanMachineInput) -> MachineScanResult {
    scan_machine_with_artifact_callback(input, |_| {})
}

pub fn scan_machine_streaming<F>(input: ScanMachineInput, on_artifact: F) -> MachineScanResult
where
    F: FnMut(&SkillArtifact),
{
    scan_machine_with_artifact_callback(input, on_artifact)
}

fn scan_machine_with_artifact_callback<F>(
    input: ScanMachineInput,
    mut on_artifact: F,
) -> MachineScanResult
where
    F: FnMut(&SkillArtifact),
{
    let scan_plan = build_scan_plan(input);
    let (roots, mut warnings) = prepare_scan_roots(&scan_plan);
    for invalid_glob in &scan_plan.invalid_globs {
        warnings.push(ScanWarning {
            root: "includeGlobs".to_string(),
            message: format!("Invalid include glob ignored: {}", invalid_glob),
        });
    }

    if scan_plan.requires_file_scan() {
        return scan_machine_with_files(&scan_plan, roots, warnings, &mut on_artifact);
    }

    scan_machine_repositories_only(roots, warnings)
}

fn scan_machine_with_files<F>(
    scan_plan: &ScanPlan,
    roots: Vec<ScannedRoot>,
    mut warnings: Vec<ScanWarning>,
    on_artifact: &mut F,
) -> MachineScanResult
where
    F: FnMut(&SkillArtifact),
{
    let mut artifacts = Vec::new();
    let mut candidates = Vec::new();
    let mut repos_by_path = HashMap::new();
    let mut seen_paths = HashSet::new();
    let skipped_directory_count = Arc::new(AtomicUsize::new(0));

    for root in roots
        .iter()
        .filter(|root| root.status == ScannedRootStatus::Scanned)
    {
        let Some(normalized_path) = root.normalized_path.as_deref() else {
            continue;
        };
        let source_root = normalized_path.to_string();
        let skipped_directory_count_for_filter = Arc::clone(&skipped_directory_count);
        let mut walker_builder = WalkBuilder::new(normalized_path);
        walker_builder
            .follow_links(true)
            .hidden(false)
            .parents(false)
            .ignore(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .filter_entry(move |entry| {
                if should_skip_dir(entry) {
                    skipped_directory_count_for_filter.fetch_add(1, Ordering::Relaxed);
                    false
                } else {
                    true
                }
            });

        for entry_result in walker_builder.build() {
            let entry = match entry_result {
                Ok(entry) => entry,
                Err(error) => {
                    warnings.push(ScanWarning {
                        root: source_root.clone(),
                        message: error.to_string(),
                    });
                    continue;
                }
            };

            let Some(file_type) = entry.file_type() else {
                continue;
            };

            if file_type.is_dir() {
                if is_git_repo_root(entry.path()) {
                    record_repo(
                        entry.path(),
                        &source_root,
                        RepoScanDetail::Full,
                        &mut repos_by_path,
                    );
                }
                continue;
            }

            if !file_type.is_file() {
                continue;
            }
            let Some(candidate) = scan_candidate(&entry, scan_plan) else {
                continue;
            };
            if !seen_paths.insert(candidate.path.clone()) {
                continue;
            }
            if candidate.selected {
                if let Some(artifact) = scan_file(&entry, candidate.source_scope) {
                    on_artifact(&artifact);
                    artifacts.push(artifact);
                }
            }
            candidates.push(candidate);
        }
    }

    build_scan_result(
        roots,
        repos_by_path,
        candidates,
        artifacts,
        warnings,
        skipped_directory_count.load(Ordering::Relaxed),
    )
}

fn scan_machine_repositories_only(
    roots: Vec<ScannedRoot>,
    mut warnings: Vec<ScanWarning>,
) -> MachineScanResult {
    let mut repos_by_path = HashMap::new();
    let mut skipped_directory_count = 0;

    for root in roots
        .iter()
        .filter(|root| root.status == ScannedRootStatus::Scanned)
    {
        let Some(normalized_path) = root.normalized_path.as_deref() else {
            continue;
        };
        scan_repository_directories(
            Path::new(normalized_path),
            normalized_path,
            &mut repos_by_path,
            &mut warnings,
            &mut skipped_directory_count,
        );
    }

    build_scan_result(
        roots,
        repos_by_path,
        Vec::new(),
        Vec::new(),
        warnings,
        skipped_directory_count,
    )
}

fn build_scan_result(
    roots: Vec<ScannedRoot>,
    repos_by_path: HashMap<String, CodeRepo>,
    mut candidates: Vec<ScanFileCandidate>,
    mut artifacts: Vec<SkillArtifact>,
    mut warnings: Vec<ScanWarning>,
    skipped_directory_count: usize,
) -> MachineScanResult {
    artifacts.sort_by(|left, right| left.path.cmp(&right.path));
    candidates.sort_by(|left, right| left.path.cmp(&right.path));
    let mut repos: Vec<CodeRepo> = repos_by_path.into_values().collect();
    repos.sort_by(|left, right| left.repo_root_path.cmp(&right.repo_root_path));
    warnings.sort_by(|left, right| {
        left.root
            .cmp(&right.root)
            .then_with(|| left.message.cmp(&right.message))
    });

    MachineScanResult {
        roots,
        repos,
        candidates,
        artifacts,
        warnings,
        skipped_directory_count,
        scanned_at: current_scan_timestamp(),
    }
}

pub fn read_lockfiles(input: ReadLockfilesInput) -> LockfileReadResult {
    LockfileReadResult {
        repos: input
            .repo_paths
            .iter()
            .map(|repo_path| LockfileReadRepo {
                repo_path: repo_path.clone(),
                lockfile: read_lockfile(Path::new(repo_path)),
            })
            .collect(),
    }
}

pub fn hash_files(input: HashFilesInput) -> HashFilesResult {
    HashFilesResult {
        files: input
            .files
            .iter()
            .map(|path| match fs::read_to_string(path) {
                Ok(content) => FileHashResult {
                    path: path.clone(),
                    normalized_content_hash: Some(hash_normalized_content(&content)),
                    error: None,
                },
                Err(error) => FileHashResult {
                    path: path.clone(),
                    normalized_content_hash: None,
                    error: Some(error.to_string()),
                },
            })
            .collect(),
    }
}

pub fn normalize_git_remotes(input: NormalizeGitRemotesInput) -> RepoIdentityResult {
    RepoIdentityResult {
        repos: input
            .repo_paths
            .iter()
            .map(|repo_path| {
                let root = Path::new(repo_path);
                RepoIdentity {
                    repo_path: repo_path.clone(),
                    repo_key: root.join(".git").exists().then(|| repo_key_for_root(root)),
                }
            })
            .collect(),
    }
}

pub fn create_write_plan(input: CreateWritePlanInput) -> WritePlan {
    let repo_path = PathBuf::from(&input.repo_path);
    let files: Vec<WritePlanFile> = input
        .artifacts
        .iter()
        .map(|artifact| plan_file(&repo_path, artifact))
        .collect();

    WritePlan {
        id: format!("plan:{}:{}", input.repo_id, hash_plan_files(&files)),
        repo_id: input.repo_id,
        blueprint_id: common_blueprint_id(&input.lockfile_updates),
        files,
        undo_available: true,
        warnings: Vec::new(),
    }
}

pub fn apply_write_plan(input: ApplyWritePlanInput) -> std::io::Result<ApplyWritePlanResult> {
    let repo_path = PathBuf::from(&input.repo_path);
    for file in &input.plan.files {
        if file.action == WritePlanAction::Skip {
            continue;
        }
        let target_path = repo_path.join(&file.target_path);
        write_file_atomically(&target_path, &file.generated_content)?;
    }

    let mut lockfile = read_lockfile(&repo_path).unwrap_or(SkillLockfile {
        version: 1,
        entries: Vec::new(),
    });
    let managed_targets: HashSet<String> = input
        .lockfile_updates
        .iter()
        .map(|entry| entry.target_path.clone())
        .collect();
    lockfile
        .entries
        .retain(|entry| !managed_targets.contains(&entry.target_path));

    lockfile.entries.extend(input.lockfile_updates);
    write_lockfile(&repo_path, &lockfile)?;

    Ok(ApplyWritePlanResult {
        operation_id: format!("operation:{}", input.plan.id),
        applied: true,
    })
}

pub fn get_git_diff(input: GitDiffInput) -> GitDiffResult {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(&input.repo_path)
        .arg("diff")
        .arg("--");
    for path in &input.paths {
        command.arg(path);
    }

    match command.output() {
        Ok(output) if output.status.success() => GitDiffResult {
            repo_path: input.repo_path,
            diff: String::from_utf8_lossy(&output.stdout).to_string(),
            error: None,
        },
        Ok(output) => GitDiffResult {
            repo_path: input.repo_path,
            diff: String::from_utf8_lossy(&output.stdout).to_string(),
            error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        },
        Err(error) => GitDiffResult {
            repo_path: input.repo_path,
            diff: String::new(),
            error: Some(error.to_string()),
        },
    }
}

pub fn normalize_git_remote_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches(".git");
    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        return Some(format!("github.com/{}", rest.trim_start_matches('/')));
    }
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        return Some(format!("github.com/{}", rest.trim_start_matches('/')));
    }
    if let Some(rest) = trimmed.strip_prefix("http://github.com/") {
        return Some(format!("github.com/{}", rest.trim_start_matches('/')));
    }
    if let Some(rest) = trimmed.strip_prefix("ssh://git@github.com/") {
        return Some(format!("github.com/{}", rest.trim_start_matches('/')));
    }
    None
}

pub fn hash_normalized_content(content: &str) -> String {
    hash_string(&normalize_content(content))
}

pub fn normalize_repo_relative_path(path: &Path) -> String {
    path.components()
        .filter_map(component_to_string)
        .collect::<Vec<_>>()
        .join("/")
}

pub fn normalize_absolute_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub fn read_lockfile(repo_root: &Path) -> Option<SkillLockfile> {
    let path = repo_root.join(LOCKFILE_PATH);
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_lockfile(repo_root: &Path, lockfile: &SkillLockfile) -> std::io::Result<()> {
    let path = repo_root.join(LOCKFILE_PATH);
    let mut entries = lockfile.entries.clone();
    entries.sort_by(|left, right| left.target_path.cmp(&right.target_path));
    let normalized = SkillLockfile {
        version: lockfile.version,
        entries,
    };
    let content = serde_json::to_string_pretty(&normalized)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?
        + "\n";
    write_file_atomically(&path, &content)
}

struct ScanPlan {
    roots: Vec<String>,
    selection: ScanSelection,
    include_glob_set: GlobSet,
    invalid_globs: Vec<String>,
    excluded_paths: HashSet<String>,
}

impl ScanPlan {
    fn requires_file_scan(&self) -> bool {
        self.selection.profiles.agent_skills
            || self.selection.profiles.cursor_rules
            || self.selection.profiles.repo_context
            || self.selection.profiles.global_agent_roots
            || !self.selection.include_globs.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RepoScanDetail {
    Full,
}

fn default_scan_selection() -> ScanSelection {
    ScanSelection {
        profiles: ScanSelectionProfiles {
            agent_skills: true,
            cursor_rules: true,
            repo_context: true,
            global_agent_roots: false,
        },
        include_globs: Vec::new(),
        excluded_paths: Vec::new(),
    }
}

fn build_scan_plan(input: ScanMachineInput) -> ScanPlan {
    let (include_glob_set, invalid_globs) = compile_include_globs(&input.selection.include_globs);
    let mut roots = input.roots;
    if input.selection.profiles.global_agent_roots {
        roots.extend(global_agent_root_inputs());
    }
    let mut seen_roots = HashSet::new();
    roots.retain(|root| seen_roots.insert(root.trim().to_string()));
    let excluded_paths = input
        .selection
        .excluded_paths
        .iter()
        .filter_map(|path| expand_input_path(path))
        .map(|path| fs::canonicalize(&path).unwrap_or(path))
        .map(|path| normalize_absolute_path(&path))
        .collect();

    ScanPlan {
        roots,
        selection: input.selection,
        include_glob_set,
        invalid_globs,
        excluded_paths,
    }
}

fn compile_include_globs(globs: &[String]) -> (GlobSet, Vec<String>) {
    let mut builder = GlobSetBuilder::new();
    let mut invalid_globs = Vec::new();
    for glob in globs {
        let trimmed = glob.trim();
        if trimmed.is_empty()
            || Path::new(trimmed).is_absolute()
            || trimmed.split(['/', '\\']).any(|part| part == "..")
        {
            invalid_globs.push(glob.clone());
            continue;
        }

        let patterns = if trimmed.starts_with("**/") {
            vec![trimmed.to_string()]
        } else {
            vec![trimmed.to_string(), format!("**/{trimmed}")]
        };
        for pattern in patterns {
            match Glob::new(&pattern) {
                Ok(compiled) => {
                    builder.add(compiled);
                }
                Err(_) => invalid_globs.push(glob.clone()),
            }
        }
    }

    let glob_set = builder
        .build()
        .unwrap_or_else(|_| GlobSetBuilder::new().build().expect("empty globset"));
    (glob_set, invalid_globs)
}

fn prepare_scan_roots(scan_plan: &ScanPlan) -> (Vec<ScannedRoot>, Vec<ScanWarning>) {
    let root_inputs = scan_plan.roots.clone();
    let mut roots = Vec::new();
    let mut warnings = Vec::new();
    let mut seen_scanned_roots = HashSet::new();

    for root_input in root_inputs {
        let (root, warning) = scanned_root_for_input(root_input);
        if let Some(normalized_path) = root.normalized_path.as_deref() {
            if !seen_scanned_roots.insert(normalized_path.to_string()) {
                continue;
            }
        }
        if let Some(warning) = warning {
            warnings.push(warning);
        }
        roots.push(root);
    }

    roots.sort_by(|left, right| {
        let left_key = left
            .normalized_path
            .as_deref()
            .unwrap_or(left.input.as_str());
        let right_key = right
            .normalized_path
            .as_deref()
            .unwrap_or(right.input.as_str());
        left_key.cmp(right_key)
    });

    (roots, warnings)
}

fn scanned_root_for_input(input: String) -> (ScannedRoot, Option<ScanWarning>) {
    let Some(expanded_path) = expand_input_path(&input) else {
        return (
            ScannedRoot {
                input: input.clone(),
                normalized_path: None,
                status: ScannedRootStatus::Invalid,
            },
            Some(ScanWarning {
                root: input,
                message: "Root path is empty.".to_string(),
            }),
        );
    };

    if !expanded_path.exists() {
        return (
            ScannedRoot {
                input: input.clone(),
                normalized_path: None,
                status: ScannedRootStatus::Missing,
            },
            Some(ScanWarning {
                root: input,
                message: "Root path does not exist.".to_string(),
            }),
        );
    }

    if !expanded_path.is_dir() {
        return (
            ScannedRoot {
                input: input.clone(),
                normalized_path: None,
                status: ScannedRootStatus::Invalid,
            },
            Some(ScanWarning {
                root: input,
                message: "Root path is not a directory.".to_string(),
            }),
        );
    }

    if let Err(error) = fs::read_dir(&expanded_path) {
        return (
            ScannedRoot {
                input: input.clone(),
                normalized_path: None,
                status: ScannedRootStatus::Unreadable,
            },
            Some(ScanWarning {
                root: input,
                message: error.to_string(),
            }),
        );
    }

    match fs::canonicalize(&expanded_path) {
        Ok(path) => (
            ScannedRoot {
                input,
                normalized_path: Some(normalize_absolute_path(&path)),
                status: ScannedRootStatus::Scanned,
            },
            None,
        ),
        Err(error) => (
            ScannedRoot {
                input: input.clone(),
                normalized_path: None,
                status: ScannedRootStatus::Unreadable,
            },
            Some(ScanWarning {
                root: input,
                message: error.to_string(),
            }),
        ),
    }
}

fn expand_input_path(input: &str) -> Option<PathBuf> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let home = home_dir()?;
        let suffix = trimmed
            .strip_prefix("~")
            .unwrap_or_default()
            .trim_start_matches(['/', '\\']);
        return Some(if suffix.is_empty() {
            home
        } else {
            home.join(suffix)
        });
    }

    let user_profile_prefix = "%USERPROFILE%";
    if trimmed
        .to_ascii_uppercase()
        .starts_with(&user_profile_prefix.to_ascii_uppercase())
    {
        let home = home_dir()?;
        let suffix = trimmed[user_profile_prefix.len()..].trim_start_matches(['/', '\\']);
        return Some(if suffix.is_empty() {
            home
        } else {
            home.join(suffix)
        });
    }

    Some(PathBuf::from(trimmed))
}

fn global_agent_root_inputs() -> Vec<String> {
    let Some(home_path) = home_dir() else {
        return Vec::new();
    };
    [".claude", ".agents", ".codex", ".cursor"]
        .iter()
        .map(|folder| home_path.join(folder))
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn home_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(PathBuf::from(home))
}

fn current_scan_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

fn should_skip_dir(entry: &DirEntry) -> bool {
    let Some(file_type) = entry.file_type() else {
        return false;
    };
    if !file_type.is_dir() {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    should_skip_dir_name(&name)
}

fn should_skip_dir_name(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
}

fn is_git_repo_root(path: &Path) -> bool {
    path.join(".git").exists()
}

fn scan_repository_directories(
    root: &Path,
    source_root: &str,
    repos_by_path: &mut HashMap<String, CodeRepo>,
    warnings: &mut Vec<ScanWarning>,
    skipped_directory_count: &mut usize,
) {
    let mut pending = vec![root.to_path_buf()];

    while let Some(directory) = pending.pop() {
        if is_git_repo_root(&directory) {
            record_repo(&directory, source_root, RepoScanDetail::Full, repos_by_path);
            continue;
        }

        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                warnings.push(ScanWarning {
                    root: normalize_absolute_path(&directory),
                    message: error.to_string(),
                });
                continue;
            }
        };

        for entry_result in entries {
            let entry = match entry_result {
                Ok(entry) => entry,
                Err(error) => {
                    warnings.push(ScanWarning {
                        root: normalize_absolute_path(&directory),
                        message: error.to_string(),
                    });
                    continue;
                }
            };

            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }

            let file_name = entry.file_name();
            let directory_name = file_name.to_string_lossy();
            if should_skip_dir_name(&directory_name) {
                *skipped_directory_count += 1;
                continue;
            }

            pending.push(entry.path());
        }
    }
}

fn record_repo(
    repo_root: &Path,
    source_root: &str,
    detail: RepoScanDetail,
    repos_by_path: &mut HashMap<String, CodeRepo>,
) {
    let canonical_repo_root =
        fs::canonicalize(repo_root).unwrap_or_else(|_| repo_root.to_path_buf());
    let repo_root_path = normalize_absolute_path(&canonical_repo_root);
    repos_by_path
        .entry(repo_root_path.clone())
        .or_insert_with(|| {
            let git_status = match detail {
                RepoScanDetail::Full => git_status_porcelain(&canonical_repo_root),
            };

            CodeRepo {
                repo_root_path: repo_root_path.clone(),
                repo_key: repo_key_for_root(&canonical_repo_root),
                source_root: source_root.to_string(),
                git_common_dir: git_common_dir(&canonical_repo_root),
                branch_name: git_branch_name(&canonical_repo_root),
                local_branch_count: git_local_branch_count(&canonical_repo_root),
                head_sha: git_head_sha(&canonical_repo_root),
                is_dirty: git_status
                    .as_deref()
                    .map(|status| !status.is_empty())
                    .unwrap_or(false),
                skill_file_count: count_known_skill_files(&canonical_repo_root),
                dirty_skill_file_count: git_status
                    .as_deref()
                    .map(count_dirty_skill_files)
                    .unwrap_or_default(),
                is_worktree: git_config_path(&canonical_repo_root)
                    .map(|path| !path.starts_with(canonical_repo_root.join(".git")))
                    .unwrap_or(false),
                is_nested: find_repo_root_above(&canonical_repo_root).is_some(),
                has_rudel_lockfile: canonical_repo_root.join(LOCKFILE_PATH).exists(),
            }
        });
}

fn scan_candidate(entry: &DirEntry, scan_plan: &ScanPlan) -> Option<ScanFileCandidate> {
    let path = entry.path();
    let canonical_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let normalized_canonical_path = normalize_absolute_path(&canonical_path);
    let matched_by = detect_candidate_match(path, scan_plan)?;
    let repo_root = find_repo_root(path);
    let source_scope = source_scope_for(path, repo_root.as_deref(), entry);
    let metadata = fs::metadata(path).ok()?;
    let skipped_reason =
        skipped_reason_for_candidate(path, &normalized_canonical_path, scan_plan, metadata.len());

    Some(ScanFileCandidate {
        path: normalized_canonical_path,
        repo_root_path: repo_root.as_deref().map(normalize_absolute_path),
        source_scope,
        matched_by,
        selected: skipped_reason.is_none(),
        size_bytes: metadata.len(),
        skipped_reason,
    })
}

fn skipped_reason_for_candidate(
    path: &Path,
    normalized_canonical_path: &str,
    scan_plan: &ScanPlan,
    size_bytes: u64,
) -> Option<ScanFileSkippedReason> {
    if scan_plan.excluded_paths.contains(normalized_canonical_path) {
        return Some(ScanFileSkippedReason::Excluded);
    }
    if size_bytes > MAX_SCANNED_FILE_BYTES {
        return Some(ScanFileSkippedReason::TooLarge);
    }
    if is_probably_binary(path) {
        return Some(ScanFileSkippedReason::Binary);
    }
    None
}

fn detect_candidate_match(path: &Path, scan_plan: &ScanPlan) -> Option<ScanFileMatchedBy> {
    let normalized = normalize_repo_relative_path(path);
    let file_name = path.file_name()?.to_string_lossy();
    if scan_plan.selection.profiles.repo_context
        && (file_name == "AGENTS.md" || file_name == "CLAUDE.md")
    {
        return Some(ScanFileMatchedBy::RepoContext);
    }
    if scan_plan.selection.profiles.cursor_rules
        && normalized.contains("/.cursor/rules/")
        && normalized.ends_with(".mdc")
    {
        return Some(ScanFileMatchedBy::CursorRules);
    }
    if file_name == "SKILL.md" {
        if scan_plan.selection.profiles.agent_skills
            && (normalized.contains("/.claude/skills/")
                || normalized.contains("/.agents/skills/")
                || normalized.contains("/.codex/skills/")
                || normalized.contains("/.cursor/skills/"))
        {
            return Some(ScanFileMatchedBy::AgentSkills);
        }
        if scan_plan.selection.profiles.global_agent_roots
            && (normalized.contains("/.claude/")
                || normalized.contains("/.agents/")
                || normalized.contains("/.codex/")
                || normalized.contains("/.cursor/"))
        {
            return Some(ScanFileMatchedBy::GlobalAgentRoots);
        }
    }
    if scan_plan.include_glob_set.is_match(&normalized) {
        return Some(ScanFileMatchedBy::IncludeGlob);
    }
    None
}

fn is_probably_binary(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    bytes.iter().take(1024).any(|byte| *byte == 0)
}

fn scan_file(entry: &DirEntry, source_scope: SourceScope) -> Option<SkillArtifact> {
    let path = entry.path();
    let artifact_target = detect_artifact_target(path).unwrap_or(ArtifactTarget::Unknown);
    let content = fs::read_to_string(path).ok()?;
    let canonical_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let normalized_canonical_path = normalize_absolute_path(&canonical_path);
    let repo_root = find_repo_root(path);
    let repo_relative_path = repo_root
        .as_deref()
        .and_then(|root| path.strip_prefix(root).ok())
        .map(normalize_repo_relative_path);
    let lockfile_entry = repo_root
        .as_deref()
        .and_then(read_lockfile)
        .and_then(|lockfile| find_lockfile_entry(&lockfile, repo_relative_path.as_deref()));
    let (name, description) = parse_frontmatter(&content);
    let content_hash = hash_string(&content);
    let normalized_content_hash = hash_normalized_content(&content);
    let symlink_kind = symlink_kind_for(path, repo_root.as_deref());

    Some(SkillArtifact {
        id: hash_string(&normalized_canonical_path),
        source_scope,
        artifact_target,
        absolute_path_hash: hash_string(&normalized_canonical_path),
        path: normalized_canonical_path,
        repo_root_path: repo_root.as_deref().map(normalize_absolute_path),
        repo_relative_path,
        repo_key: repo_root.as_deref().map(repo_key_for_root),
        name,
        description,
        symlink_kind,
        content,
        content_hash,
        normalized_content_hash,
        lockfile_entry,
    })
}

fn detect_artifact_target(path: &Path) -> Option<ArtifactTarget> {
    let normalized = normalize_repo_relative_path(path);
    let file_name = path.file_name()?.to_string_lossy();
    if file_name == "AGENTS.md" {
        return Some(ArtifactTarget::AgentsMd);
    }
    if file_name == "CLAUDE.md" {
        return Some(ArtifactTarget::ClaudeMd);
    }
    if normalized.contains("/.cursor/rules/") && normalized.ends_with(".mdc") {
        return Some(ArtifactTarget::Cursor);
    }
    if file_name != "SKILL.md" {
        return None;
    }
    if normalized.contains("/.claude/skills/") {
        return Some(ArtifactTarget::ClaudeCode);
    }
    if normalized.contains("/.agents/skills/") {
        return Some(ArtifactTarget::Codex);
    }
    if normalized.contains("/.codex/skills/") {
        return Some(ArtifactTarget::Codex);
    }
    if normalized.contains("/.cursor/skills/") {
        return Some(ArtifactTarget::Cursor);
    }
    None
}

fn find_repo_root(path: &Path) -> Option<PathBuf> {
    let mut current = path.parent();
    while let Some(candidate) = current {
        if candidate.join(".git").exists() {
            return Some(candidate.to_path_buf());
        }
        current = candidate.parent();
    }
    None
}

fn find_lockfile_entry(
    lockfile: &SkillLockfile,
    repo_relative_path: Option<&str>,
) -> Option<SkillLockfileEntry> {
    let path = repo_relative_path?;
    lockfile
        .entries
        .iter()
        .find(|entry| entry.target_path == path)
        .cloned()
}

fn source_scope_for(path: &Path, repo_root: Option<&Path>, entry: &DirEntry) -> SourceScope {
    if entry.path_is_symlink() || symlink_kind_for(path, repo_root).is_some() {
        return SourceScope::Symlink;
    }
    if let Some(root) = repo_root {
        if find_repo_root_above(root).is_some() {
            return SourceScope::NestedRepo;
        }
        return SourceScope::Repo;
    }
    let normalized = normalize_repo_relative_path(path);
    if normalized.contains("/.claude/")
        || normalized.contains("/.agents/")
        || normalized.contains("/.codex/")
        || normalized.contains("/.cursor/")
    {
        return SourceScope::GlobalUser;
    }
    SourceScope::Unknown
}

fn symlink_kind_for(path: &Path, stop_at: Option<&Path>) -> Option<SymlinkKind> {
    let skill_folder = skill_folder_path_for(path);
    let mut current = Some(path);
    while let Some(candidate) = current {
        if stop_at.is_some_and(|root| candidate == root) {
            break;
        }
        if fs::symlink_metadata(candidate)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Some(symlink_kind_for_component(
                path,
                candidate,
                skill_folder.as_deref(),
            ));
        }
        current = candidate.parent();
    }
    None
}

fn symlink_kind_for_component(
    path: &Path,
    component: &Path,
    skill_folder: Option<&Path>,
) -> SymlinkKind {
    if component == path {
        return SymlinkKind::File;
    }
    if skill_folder.is_some_and(|folder| component == folder) {
        return SymlinkKind::SkillFolder;
    }
    if is_agent_root_path(component) {
        return SymlinkKind::AgentRoot;
    }
    SymlinkKind::AncestorFolder
}

fn skill_folder_path_for(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_string_lossy();
    if file_name == "SKILL.md" {
        return path.parent().map(Path::to_path_buf);
    }
    None
}

fn is_agent_root_path(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    matches!(file_name, ".agents" | ".claude" | ".codex" | ".cursor")
}

fn find_repo_root_above(repo_root: &Path) -> Option<PathBuf> {
    let mut current = repo_root.parent();
    while let Some(candidate) = current {
        if candidate.join(".git").exists() {
            return Some(candidate.to_path_buf());
        }
        current = candidate.parent();
    }
    None
}

fn repo_key_for_root(repo_root: &Path) -> RepoKey {
    git_origin_remote(repo_root)
        .or_else(|| read_origin_remote(repo_root))
        .and_then(|remote| normalize_git_remote_url(&remote))
        .map(RepoKey::Github)
        .unwrap_or_else(|| {
            let local_identity_path =
                git_common_dir(repo_root).unwrap_or_else(|| normalize_absolute_path(repo_root));
            RepoKey::Local(hash_string(&local_identity_path))
        })
}

fn git_origin_remote(repo_root: &Path) -> Option<String> {
    run_git_command(repo_root, &["config", "--get", "remote.origin.url"])
}

fn git_common_dir(repo_root: &Path) -> Option<String> {
    let output = run_git_command(
        repo_root,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .or_else(|| run_git_command(repo_root, &["rev-parse", "--git-common-dir"]))?;
    let path = PathBuf::from(output);
    let resolved = if path.is_absolute() {
        path
    } else {
        repo_root.join(path)
    };
    Some(normalize_absolute_path(&resolved))
}

fn git_branch_name(repo_root: &Path) -> Option<String> {
    run_git_command(repo_root, &["branch", "--show-current"])
        .filter(|branch| !branch.trim().is_empty())
}

fn git_local_branch_count(repo_root: &Path) -> usize {
    run_git_command(repo_root, &["branch", "--format=%(refname:short)"])
        .map(|branches| {
            branches
                .lines()
                .filter(|branch| !branch.trim().is_empty())
                .count()
        })
        .unwrap_or_default()
}

fn git_head_sha(repo_root: &Path) -> Option<String> {
    run_git_command(repo_root, &["rev-parse", "HEAD"])
}

fn git_status_porcelain(repo_root: &Path) -> Option<String> {
    run_git_command(
        repo_root,
        &["status", "--porcelain", "--untracked-files=all"],
    )
}

fn count_dirty_skill_files(status: &str) -> usize {
    status
        .lines()
        .map(git_status_path)
        .filter(|path| is_known_skill_or_context_path(path))
        .count()
}

fn count_known_skill_files(repo_root: &Path) -> usize {
    let context_file_count = ["AGENTS.md", "CLAUDE.md"]
        .iter()
        .filter(|relative_path| repo_root.join(relative_path).is_file())
        .count();

    context_file_count
        + count_files_named(&repo_root.join(".claude/skills"), "SKILL.md")
        + count_files_named(&repo_root.join(".agents/skills"), "SKILL.md")
        + count_files_named(&repo_root.join(".codex/skills"), "SKILL.md")
        + count_files_named(&repo_root.join(".cursor/skills"), "SKILL.md")
        + count_files_with_extension(&repo_root.join(".cursor/rules"), "mdc")
}

fn count_files_named(root: &Path, expected_file_name: &str) -> usize {
    count_matching_files(root, &|path| {
        path.file_name().and_then(|file_name| file_name.to_str()) == Some(expected_file_name)
    })
}

fn count_files_with_extension(root: &Path, expected_extension: &str) -> usize {
    count_matching_files(root, &|path| {
        path.extension().and_then(|extension| extension.to_str()) == Some(expected_extension)
    })
}

fn count_matching_files(root: &Path, matches_file: &impl Fn(&Path) -> bool) -> usize {
    if !root.is_dir() {
        return 0;
    }

    let mut count = 0;
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                pending.push(entry.path());
            } else if file_type.is_file() && matches_file(&entry.path()) {
                count += 1;
            }
        }
    }
    count
}

fn git_status_path(line: &str) -> &str {
    line.get(3..).unwrap_or(line).trim().trim_matches('"')
}

fn is_known_skill_or_context_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    if normalized == "AGENTS.md" || normalized == "CLAUDE.md" {
        return true;
    }
    if normalized.starts_with(".cursor/rules/") && normalized.ends_with(".mdc") {
        return true;
    }
    is_known_agent_skill_path(&normalized)
}

fn is_known_agent_skill_path(path: &str) -> bool {
    path.ends_with("/SKILL.md")
        && (path.starts_with(".claude/skills/")
            || path.starts_with(".agents/skills/")
            || path.starts_with(".codex/skills/")
            || path.starts_with(".cursor/skills/"))
}

fn run_git_command(repo_root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_origin_remote(repo_root: &Path) -> Option<String> {
    let config = fs::read_to_string(git_config_path(repo_root)?).ok()?;
    let mut in_origin = false;
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[remote ") {
            in_origin = trimmed == "[remote \"origin\"]";
            continue;
        }
        if in_origin {
            if let Some(url) = trimmed.strip_prefix("url =") {
                return Some(url.trim().to_string());
            }
        }
    }
    None
}

fn git_config_path(repo_root: &Path) -> Option<PathBuf> {
    let git_path = repo_root.join(".git");
    if git_path.is_dir() {
        return Some(git_path.join("config"));
    }
    if !git_path.is_file() {
        return None;
    }

    let content = fs::read_to_string(git_path).ok()?;
    let git_dir = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("gitdir:"))
        .map(str::trim)?;
    let git_dir_path = PathBuf::from(git_dir);
    let resolved_git_dir = if git_dir_path.is_absolute() {
        git_dir_path
    } else {
        repo_root.join(git_dir_path)
    };
    Some(resolved_git_dir.join("config"))
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let normalized = normalize_content(content);
    if !normalized.starts_with("---\n") {
        return (None, None);
    }
    let Some(end) = normalized[4..].find("\n---") else {
        return (None, None);
    };
    let frontmatter = &normalized[4..4 + end];
    let mut fields = HashMap::new();
    for line in frontmatter.lines() {
        if let Some((key, value)) = line.split_once(':') {
            fields.insert(key.trim(), value.trim().trim_matches('"').to_string());
        }
    }
    (
        fields.get("name").cloned(),
        fields.get("description").cloned(),
    )
}

fn plan_file(repo_path: &Path, artifact: &GeneratedArtifact) -> WritePlanFile {
    let target_path = repo_path.join(&artifact.target_path);
    let current = fs::read_to_string(&target_path).ok();
    let generated_content = planned_file_content(current.as_deref(), artifact);
    let current_owned_hash = current
        .as_deref()
        .map(|content| owned_content_hash(content, artifact));
    let action = match current.as_deref() {
        None => WritePlanAction::Create,
        Some(_) if current_owned_hash.as_deref() == Some(artifact.content_hash.as_str()) => {
            WritePlanAction::Skip
        }
        Some(_) => WritePlanAction::Modify,
    };
    let diff = current.as_deref().and_then(|content| {
        if current_owned_hash.as_deref() == Some(artifact.content_hash.as_str()) {
            None
        } else {
            Some(simple_diff(content, &generated_content))
        }
    });
    let mut warnings = Vec::new();
    if is_context_target(&artifact.artifact_target)
        && current.is_some()
        && !has_managed_section(current.as_deref().unwrap_or_default(), artifact)
    {
        warnings.push("No managed section exists; plan appends one.".to_string());
    }

    WritePlanFile {
        target_path: artifact.target_path.clone(),
        action,
        generated_content,
        diff,
        warnings,
    }
}

fn planned_file_content(current: Option<&str>, artifact: &GeneratedArtifact) -> String {
    if !is_context_target(&artifact.artifact_target) {
        return artifact.content.clone();
    }

    let Some(current_content) = current else {
        return artifact.content.clone();
    };
    let slug = managed_slug_for_artifact(artifact);
    if let Some((start, end)) = managed_section_bounds(current_content, &slug) {
        let mut output =
            String::with_capacity(current_content.len() - (end - start) + artifact.content.len());
        output.push_str(&current_content[..start]);
        output.push_str(&artifact.content);
        output.push_str(&current_content[end..]);
        return output;
    }

    if current_content.trim().is_empty() {
        return artifact.content.clone();
    }

    format!("{}\n\n{}", current_content.trim_end(), artifact.content)
}

fn owned_content_hash(content: &str, artifact: &GeneratedArtifact) -> String {
    if !is_context_target(&artifact.artifact_target) {
        return hash_normalized_content(content);
    }
    let slug = managed_slug_for_artifact(artifact);
    extract_managed_section(content, &slug)
        .map(|section| hash_normalized_content(&section))
        .unwrap_or_else(|| hash_normalized_content(content))
}

fn is_context_target(target: &ArtifactTarget) -> bool {
    matches!(target, ArtifactTarget::AgentsMd | ArtifactTarget::ClaudeMd)
}

fn has_managed_section(content: &str, artifact: &GeneratedArtifact) -> bool {
    let slug = managed_slug_for_artifact(artifact);
    managed_section_bounds(content, &slug).is_some()
}

fn managed_slug_for_artifact(artifact: &GeneratedArtifact) -> String {
    let marker_prefix = "<!-- rudel:";
    artifact
        .content
        .find(marker_prefix)
        .and_then(|start| {
            let slug_start = start + marker_prefix.len();
            artifact.content[slug_start..]
                .find(":start -->")
                .map(|end| artifact.content[slug_start..slug_start + end].to_string())
        })
        .unwrap_or_else(|| artifact.blueprint_id.clone())
}

fn extract_managed_section(content: &str, slug: &str) -> Option<String> {
    let (start, end) = managed_section_bounds(content, slug)?;
    Some(content[start..end].to_string())
}

fn managed_section_bounds(content: &str, slug: &str) -> Option<(usize, usize)> {
    let start_marker = format!("<!-- rudel:{}:start -->", slug);
    let end_marker = format!("<!-- rudel:{}:end -->", slug);
    let start = content.find(&start_marker)?;
    let end_marker_start = content[start + start_marker.len()..]
        .find(&end_marker)
        .map(|relative| start + start_marker.len() + relative)?;
    let mut end = end_marker_start + end_marker.len();
    if content[end..].starts_with("\r\n") {
        end += 2;
    } else if content[end..].starts_with('\n') {
        end += 1;
    }
    Some((start, end))
}

fn simple_diff(current: &str, expected: &str) -> String {
    format!(
        "--- current\n+++ expected\n-current sha256:{}\n+expected sha256:{}\n",
        hash_normalized_content(current),
        hash_normalized_content(expected)
    )
}

fn common_blueprint_id(entries: &[SkillLockfileEntry]) -> String {
    entries
        .first()
        .map(|entry| entry.blueprint_id.clone())
        .unwrap_or_else(|| "unmanaged".to_string())
}

fn hash_plan_files(files: &[WritePlanFile]) -> String {
    let digest_input = files
        .iter()
        .map(|file| {
            format!(
                "{}|{:?}|{}",
                file.target_path,
                file.action,
                hash_normalized_content(&file.generated_content)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    hash_string(&digest_input)
}

fn write_file_atomically(path: &Path, content: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "rudel-file".to_string());
    let temp_path =
        path.with_file_name(format!(".{}.rudel-tmp-{}", file_name, hash_string(content)));
    fs::write(&temp_path, content)?;
    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            Err(error)
        }
    }
}

fn normalize_content(content: &str) -> String {
    content.replace("\r\n", "\n")
}

fn hash_string(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn component_to_string(component: Component<'_>) -> Option<String> {
    match component {
        Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().replace('\\', "/")),
        Component::RootDir => None,
        Component::CurDir => None,
        Component::ParentDir => Some("..".to_string()),
        Component::Normal(value) => Some(value.to_string_lossy().replace('\\', "/")),
    }
}

#[allow(dead_code)]
fn _stable_map_for_future_json(values: BTreeMap<String, String>) -> BTreeMap<String, String> {
    values
}

#[cfg(test)]
mod tests {
    use super::{
        apply_write_plan, create_write_plan, hash_normalized_content, normalize_absolute_path,
        normalize_git_remote_url, read_lockfile, scan_machine, scan_machine_streaming,
        ApplyWritePlanInput, ArtifactTarget, CreateWritePlanInput, GeneratedArtifact,
        LockfileStatus, RepoKey, ScanFileSkippedReason, ScanMachineInput, ScanSelection,
        ScanSelectionProfiles, ScannedRootStatus, SkillLockfileEntry, SourceScope, SymlinkKind,
        WritePlanAction,
    };
    use std::{fs, path::Path, process::Command};
    use tempfile::tempdir;

    #[test]
    fn scan_machine_finds_repo_and_global_skill_files() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("api");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            repo.join(".git/config"),
            "[remote \"origin\"]\n  url = git@github.com:company/api.git\n",
        )
        .expect("write git config");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\ndescription: TS rules\n---\n# TypeScript Standards\n",
        )
        .expect("write skill");
        fs::write(repo.join("AGENTS.md"), "# Repo Instructions\n").expect("write agents");

        let result = scan_machine(scan_input(vec![temp.path().to_string_lossy().to_string()]));

        assert_eq!(result.roots.len(), 1);
        assert_eq!(result.roots[0].status, ScannedRootStatus::Scanned);
        assert_eq!(result.repos.len(), 1);
        assert_eq!(
            result.repos[0].repo_key,
            RepoKey::Github("github.com/company/api".to_string()),
        );
        assert_eq!(result.artifacts.len(), 2);
        let skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.name.as_deref() == Some("typescript-standards"))
            .expect("typescript standards artifact");
        assert_eq!(skill.artifact_target, ArtifactTarget::ClaudeCode);
        assert_eq!(
            skill.repo_root_path.as_deref(),
            Some(canonical_test_path(&repo).as_str()),
        );
        assert!(skill
            .path
            .ends_with("/api/.claude/skills/typescript-standards/SKILL.md"));
        assert_eq!(
            skill.repo_key,
            Some(RepoKey::Github("github.com/company/api".to_string())),
        );
    }

    #[cfg(unix)]
    #[test]
    fn scan_machine_marks_symlinked_skill_directories() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("api");
        let shared_skill = temp.path().join("shared/typescript-standards");
        let shared_file = temp.path().join("shared/file-link-skill.md");
        let shared_agent_root = temp.path().join("shared/agent-root");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(repo.join(".agents/skills")).expect("create skills dir");
        fs::create_dir_all(&shared_skill).expect("create shared skill dir");
        fs::create_dir_all(shared_agent_root.join("skills/agent-root-skill"))
            .expect("create shared agent root skill dir");
        fs::write(
            shared_skill.join("SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write shared skill");
        fs::write(
            shared_agent_root.join("skills/agent-root-skill/SKILL.md"),
            "---\nname: agent-root-skill\n---\n# Agent Root Skill\n",
        )
        .expect("write shared agent root skill");
        symlink(
            &shared_skill,
            repo.join(".agents/skills/typescript-standards"),
        )
        .expect("symlink skill dir");
        symlink(&shared_agent_root, repo.join(".codex")).expect("symlink agent root");
        fs::write(
            &shared_file,
            "---\nname: file-link-skill\n---\n# File Link Skill\n",
        )
        .expect("write shared skill file");
        fs::create_dir_all(repo.join(".claude/skills/file-link-skill"))
            .expect("create file link skill dir");
        symlink(
            &shared_file,
            repo.join(".claude/skills/file-link-skill/SKILL.md"),
        )
        .expect("symlink skill file");

        let result = scan_machine(scan_input(vec![temp.path().to_string_lossy().to_string()]));

        let skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.name.as_deref() == Some("typescript-standards"))
            .expect("typescript standards artifact");
        assert_eq!(skill.source_scope, SourceScope::Symlink);
        assert_eq!(skill.symlink_kind, Some(SymlinkKind::SkillFolder));
        assert_eq!(skill.artifact_target, ArtifactTarget::Codex);
        assert_eq!(
            skill.repo_relative_path.as_deref(),
            Some(".agents/skills/typescript-standards/SKILL.md"),
        );
        let file_link_skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.name.as_deref() == Some("file-link-skill"))
            .expect("file link skill artifact");
        assert_eq!(file_link_skill.source_scope, SourceScope::Symlink);
        assert_eq!(file_link_skill.symlink_kind, Some(SymlinkKind::File));
        let agent_root_skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.name.as_deref() == Some("agent-root-skill"))
            .expect("agent root skill artifact");
        assert_eq!(agent_root_skill.source_scope, SourceScope::Symlink);
        assert_eq!(agent_root_skill.symlink_kind, Some(SymlinkKind::AgentRoot));
    }

    #[test]
    fn scan_machine_counts_dirty_skill_files_in_repositories() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("api");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create skill dir");
        fs::create_dir_all(repo.join("src")).expect("create src dir");
        init_git_repo(&repo);
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "# TypeScript Standards\n",
        )
        .expect("write skill");
        fs::write(repo.join("AGENTS.md"), "# Repo Instructions\n").expect("write agents");
        fs::write(repo.join("src/main.ts"), "export const value = 1;\n").expect("write source");

        let result = scan_machine(repo_scan_input(vec![temp
            .path()
            .to_string_lossy()
            .to_string()]));

        assert_eq!(result.repos.len(), 1);
        assert!(result.repos[0].is_dirty);
        assert_eq!(result.repos[0].skill_file_count, 2);
        assert_eq!(result.repos[0].dirty_skill_file_count, 2);
    }

    #[test]
    fn scan_machine_handles_crlf_frontmatter_and_nested_repos() {
        let temp = tempdir().expect("temp dir");
        let parent = temp.path().join("parent");
        let nested = parent.join("nested");
        fs::create_dir_all(parent.join(".git")).expect("create parent git");
        fs::create_dir_all(nested.join(".git")).expect("create nested git");
        fs::create_dir_all(nested.join(".agents/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            nested.join(".agents/skills/typescript-standards/SKILL.md"),
            "---\r\nname: typescript-standards\r\ndescription: TS rules\r\n---\r\n# TypeScript Standards\r\n",
        )
        .expect("write skill");

        let result = scan_machine(scan_input(vec![parent.to_string_lossy().to_string()]));

        let skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.repo_relative_path.as_deref().is_some())
            .expect("nested skill artifact");
        assert_eq!(skill.name.as_deref(), Some("typescript-standards"));
        assert_eq!(
            skill.repo_root_path.as_deref(),
            Some(canonical_test_path(&nested).as_str()),
        );
        assert_eq!(skill.source_scope, SourceScope::NestedRepo);
        assert_eq!(skill.artifact_target, ArtifactTarget::Codex);
    }

    #[test]
    fn scan_machine_returns_git_repos_without_skill_files() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("empty");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");

        let result = scan_machine(scan_input(vec![temp.path().to_string_lossy().to_string()]));

        assert!(result.artifacts.is_empty());
        assert_eq!(result.repos.len(), 1);
        assert_eq!(result.repos[0].repo_root_path, canonical_test_path(&repo),);
    }

    #[test]
    fn scan_machine_uses_repo_only_fast_path_when_no_files_are_requested() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        let nested_repo = repo.join("nested");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(nested_repo.join(".git")).expect("create nested git dir");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write skill");

        let result = scan_machine(repo_scan_input(vec![temp
            .path()
            .to_string_lossy()
            .to_string()]));

        assert_eq!(result.repos.len(), 1);
        assert_eq!(result.repos[0].repo_root_path, canonical_test_path(&repo));
        assert!(result.candidates.is_empty());
        assert!(result.artifacts.is_empty());
    }

    #[test]
    fn scan_machine_handles_git_file_worktrees() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("worktree");
        let git_dir = temp.path().join("gitdirs/worktree");
        fs::create_dir_all(&repo).expect("create repo");
        fs::create_dir_all(&git_dir).expect("create git dir");
        fs::write(
            repo.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .expect("write git file");
        fs::write(
            git_dir.join("config"),
            "[remote \"origin\"]\n  url = https://github.com/company/worktree.git\n",
        )
        .expect("write git config");

        let result = scan_machine(scan_input(vec![temp.path().to_string_lossy().to_string()]));

        assert_eq!(result.repos.len(), 1);
        assert_eq!(
            result.repos[0].repo_key,
            RepoKey::Github("github.com/company/worktree".to_string()),
        );
    }

    #[test]
    fn scan_machine_reports_missing_roots() {
        let temp = tempdir().expect("temp dir");
        let missing = temp.path().join("missing");

        let result = scan_machine(scan_input(vec![missing.to_string_lossy().to_string()]));

        assert_eq!(result.roots.len(), 1);
        assert_eq!(result.roots[0].status, ScannedRootStatus::Missing);
        assert_eq!(result.warnings.len(), 1);
        assert!(result.repos.is_empty());
    }

    #[test]
    fn scan_machine_dedupes_overlapping_roots() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("api");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(repo.join(".agents/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            repo.join(".agents/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write skill");

        let result = scan_machine(scan_input(vec![
            temp.path().to_string_lossy().to_string(),
            repo.to_string_lossy().to_string(),
        ]));

        assert_eq!(result.repos.len(), 1);
        assert_eq!(result.artifacts.len(), 1);
    }

    #[test]
    fn scan_machine_keeps_global_user_artifacts_out_of_repo_assignment() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir_all(temp.path().join(".claude/skills/typescript-standards"))
            .expect("create global skill dir");
        fs::write(
            temp.path()
                .join(".claude/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write global skill");

        let result = scan_machine(scan_input(vec![temp.path().to_string_lossy().to_string()]));

        assert!(result.repos.is_empty());
        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(result.artifacts[0].source_scope, SourceScope::GlobalUser);
        assert!(result.artifacts[0].repo_root_path.is_none());
    }

    #[test]
    fn scan_machine_streaming_reports_artifacts_as_they_are_found() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write skill");

        let mut streamed_paths = Vec::new();
        let result = scan_machine_streaming(
            scan_input(vec![temp.path().to_string_lossy().to_string()]),
            |artifact| streamed_paths.push(artifact.path.clone()),
        );

        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(streamed_paths, vec![result.artifacts[0].path.clone()]);
    }

    #[test]
    fn scan_machine_respects_profiles_and_custom_include_globs() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create claude skill dir");
        fs::create_dir_all(repo.join(".opencode/skills/company")).expect("create custom skill dir");
        fs::write(repo.join("AGENTS.md"), "# Repo Rules\n").expect("write agents");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "---\nname: typescript-standards\n---\n# TypeScript Standards\n",
        )
        .expect("write claude skill");
        fs::write(
            repo.join(".opencode/skills/company/SKILL.md"),
            "---\nname: company-skill\n---\n# Company Skill\n",
        )
        .expect("write custom skill");

        let mut input = scan_input(vec![repo.to_string_lossy().to_string()]);
        input.selection.profiles.agent_skills = false;
        input.selection.include_globs = vec![".opencode/skills/**/SKILL.md".to_string()];

        let result = scan_machine(input);

        assert_eq!(result.candidates.len(), 2);
        assert!(result
            .artifacts
            .iter()
            .any(|artifact| artifact.name.as_deref() == Some("company-skill")));
        assert!(!result
            .artifacts
            .iter()
            .any(|artifact| artifact.name.as_deref() == Some("typescript-standards")));
    }

    #[test]
    fn scan_machine_keeps_excluded_candidates_metadata_only() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(repo.join(".git")).expect("create git dir");
        let agents = repo.join("AGENTS.md");
        fs::write(&agents, "# Repo Rules\n").expect("write agents");

        let mut input = scan_input(vec![repo.to_string_lossy().to_string()]);
        input.selection.excluded_paths = vec![agents.to_string_lossy().to_string()];

        let result = scan_machine(input);

        assert_eq!(result.candidates.len(), 1);
        assert!(!result.candidates[0].selected);
        assert_eq!(
            result.candidates[0].skipped_reason,
            Some(ScanFileSkippedReason::Excluded),
        );
        assert!(result.artifacts.is_empty());
    }

    #[test]
    fn scan_machine_warns_on_invalid_include_globs() {
        let temp = tempdir().expect("temp dir");
        let mut input = scan_input(vec![temp.path().to_string_lossy().to_string()]);
        input.selection.include_globs = vec!["../outside/**".to_string()];

        let result = scan_machine(input);

        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0]
            .message
            .contains("Invalid include glob ignored"));
    }

    #[test]
    fn normalize_git_remote_url_handles_common_github_forms() {
        assert_eq!(
            normalize_git_remote_url("git@github.com:company/api.git"),
            Some("github.com/company/api".to_string()),
        );
        assert_eq!(
            normalize_git_remote_url("https://github.com/company/api.git"),
            Some("github.com/company/api".to_string()),
        );
        assert_eq!(
            normalize_git_remote_url("ssh://git@github.com/company/api.git"),
            Some("github.com/company/api".to_string()),
        );
    }

    #[test]
    fn hash_normalized_content_ignores_crlf_differences() {
        assert_eq!(
            hash_normalized_content("one\ntwo\n"),
            hash_normalized_content("one\r\ntwo\r\n"),
        );
    }

    #[test]
    fn create_write_plan_skips_current_and_modifies_drifted_files() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(repo.join(".agents/skills/typescript-standards"))
            .expect("create skill dir");
        let artifact = generated_artifact("expected\n", "v1");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "old\n",
        )
        .err();

        let lockfile_update = lockfile_entry_for_artifact(&artifact);
        let plan = create_write_plan(CreateWritePlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            lockfile_updates: vec![lockfile_update],
        });

        assert_eq!(plan.files.len(), 1);
        assert_eq!(plan.files[0].action, WritePlanAction::Create);
        assert!(plan.undo_available);
    }

    #[test]
    fn context_files_update_only_managed_sections() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        fs::write(
            repo.join("AGENTS.md"),
            "# Repo Rules\n\n<!-- rudel:typescript-standards:start -->\nold\n<!-- rudel:typescript-standards:end -->\n\nKeep this.\n",
        )
        .expect("write agents");
        let artifact = context_artifact(
            "AGENTS.md",
            "<!-- rudel:typescript-standards:start -->\nnew\n<!-- rudel:typescript-standards:end -->\n",
        );

        let lockfile_update = lockfile_entry_for_artifact(&artifact);
        let plan = create_write_plan(CreateWritePlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            lockfile_updates: vec![lockfile_update],
        });

        assert_eq!(plan.files[0].action, WritePlanAction::Modify);
        assert!(plan.files[0].generated_content.contains("# Repo Rules"));
        assert!(plan.files[0].generated_content.contains("new"));
        assert!(plan.files[0].generated_content.contains("Keep this."));
        assert!(!plan.files[0].generated_content.contains("\nold\n"));
        assert!(plan.files[0].warnings.is_empty());
    }

    #[test]
    fn context_files_append_missing_managed_sections() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        fs::write(repo.join("CLAUDE.md"), "# Repo Rules\n").expect("write claude");
        let mut artifact = context_artifact(
            "CLAUDE.md",
            "<!-- rudel:typescript-standards:start -->\nnew\n<!-- rudel:typescript-standards:end -->\n",
        );
        artifact.artifact_target = ArtifactTarget::ClaudeMd;

        let lockfile_update = lockfile_entry_for_artifact(&artifact);
        let plan = create_write_plan(CreateWritePlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            lockfile_updates: vec![lockfile_update],
        });

        assert_eq!(plan.files[0].action, WritePlanAction::Modify);
        assert!(plan.files[0]
            .generated_content
            .contains("# Repo Rules\n\n<!-- rudel:typescript-standards:start -->"));
        assert_eq!(plan.files[0].warnings.len(), 1);
    }

    #[test]
    fn apply_write_plan_writes_files_and_lockfile() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        let artifact = generated_artifact("expected\n", "v1");
        let lockfile_update = lockfile_entry_for_artifact(&artifact);
        let plan = create_write_plan(CreateWritePlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact.clone()],
            lockfile_updates: vec![lockfile_update.clone()],
        });

        let result = apply_write_plan(ApplyWritePlanInput {
            repo_path: repo.to_string_lossy().to_string(),
            plan,
            lockfile_updates: vec![lockfile_update],
        })
        .expect("apply plan");

        assert!(result.applied);
        assert_eq!(
            fs::read_to_string(repo.join(&artifact.target_path)).expect("read skill"),
            "expected\n",
        );
        let lockfile = read_lockfile(&repo).expect("read lockfile");
        assert_eq!(lockfile.entries.len(), 1);
        assert_eq!(lockfile.entries[0].status, LockfileStatus::Current);
    }

    fn generated_artifact(content: &str, version: &str) -> GeneratedArtifact {
        GeneratedArtifact {
            artifact_target: ArtifactTarget::ClaudeCode,
            target_path: ".claude/skills/typescript-standards/SKILL.md".to_string(),
            content: content.to_string(),
            content_hash: hash_normalized_content(content),
            blueprint_id: "typescript-standards".to_string(),
            blueprint_version_id: version.to_string(),
            overlay_hash: "overlay".to_string(),
            schema_version: "1".to_string(),
            compiler_version: "1".to_string(),
        }
    }

    fn lockfile_entry_for_artifact(artifact: &GeneratedArtifact) -> SkillLockfileEntry {
        SkillLockfileEntry {
            blueprint_id: artifact.blueprint_id.clone(),
            blueprint_version: artifact.blueprint_version_id.clone(),
            repo_overlay_hash: artifact.overlay_hash.clone(),
            generated_hash: artifact.content_hash.clone(),
            current_file_hash: Some(artifact.content_hash.clone()),
            artifact_target: artifact.artifact_target.clone(),
            target_path: artifact.target_path.clone(),
            schema_version: artifact.schema_version.clone(),
            compiler_version: artifact.compiler_version.clone(),
            status: LockfileStatus::Current,
        }
    }

    fn context_artifact(target_path: &str, content: &str) -> GeneratedArtifact {
        GeneratedArtifact {
            artifact_target: ArtifactTarget::AgentsMd,
            target_path: target_path.to_string(),
            content: content.to_string(),
            content_hash: hash_normalized_content(content),
            blueprint_id: "typescript-standards".to_string(),
            blueprint_version_id: "v1".to_string(),
            overlay_hash: "overlay".to_string(),
            schema_version: "1".to_string(),
            compiler_version: "1".to_string(),
        }
    }

    fn canonical_test_path(path: &std::path::Path) -> String {
        normalize_absolute_path(&fs::canonicalize(path).expect("canonical test path"))
    }

    fn init_git_repo(repo: &Path) {
        fs::create_dir_all(repo).expect("create git repo dir");
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .arg("init")
            .output()
            .expect("run git init");
        assert!(
            output.status.success(),
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn scan_input(roots: Vec<String>) -> ScanMachineInput {
        ScanMachineInput {
            roots,
            selection: ScanSelection {
                profiles: ScanSelectionProfiles {
                    agent_skills: true,
                    cursor_rules: true,
                    repo_context: true,
                    global_agent_roots: false,
                },
                include_globs: Vec::new(),
                excluded_paths: Vec::new(),
            },
        }
    }

    fn repo_scan_input(roots: Vec<String>) -> ScanMachineInput {
        ScanMachineInput {
            roots,
            selection: ScanSelection {
                profiles: ScanSelectionProfiles {
                    agent_skills: false,
                    cursor_rules: false,
                    repo_context: false,
                    global_agent_roots: false,
                },
                include_globs: Vec::new(),
                excluded_paths: Vec::new(),
            },
        }
    }
}
