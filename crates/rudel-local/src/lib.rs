use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

pub const PRODUCT_RULE: &str = "Desktop edits skills. Rust writes files. Cloud syncs teams.";
pub const LOCKFILE_PATH: &str = ".rudel/skills.lock.json";

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
    pub include_global_agent_folders: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineScanResult {
    pub roots: Vec<String>,
    pub artifacts: Vec<SkillArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillArtifact {
    pub id: String,
    pub source_scope: SourceScope,
    pub artifact_target: ArtifactTarget,
    pub absolute_path_hash: String,
    pub path: String,
    pub repo_relative_path: Option<String>,
    pub repo_key: Option<RepoKey>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub detected_slug: Option<String>,
    pub content_hash: String,
    pub normalized_content_hash: String,
    pub is_managed: bool,
    pub matched_blueprint_id: Option<String>,
    pub lockfile_status: Option<LockfileStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceScope {
    Repo,
    GlobalUser,
    NestedRepo,
    Symlink,
    Unknown,
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
pub struct ExpectedInstallation {
    pub repo_id: String,
    pub repo_path: String,
    pub repo_key: Option<RepoKey>,
    pub artifact: GeneratedArtifact,
    pub current_blueprint_version_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectDriftInput {
    pub expected_installations: Vec<ExpectedInstallation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftFinding {
    pub id: String,
    pub repo_id: String,
    pub blueprint_id: Option<String>,
    pub artifact_target: Option<ArtifactTarget>,
    pub target_path: String,
    pub status: LockfileStatus,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstallPlanInput {
    pub repo_id: String,
    pub repo_path: String,
    pub artifacts: Vec<GeneratedArtifact>,
    pub blueprint_ref: BlueprintRef,
    pub overlay_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintRef {
    pub blueprint_id: String,
    pub blueprint_version_id: String,
    pub slug: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub id: String,
    pub repo_id: String,
    pub blueprint_id: String,
    pub files: Vec<InstallPlanFile>,
    pub undo_available: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlanFile {
    pub target_path: String,
    pub action: InstallPlanAction,
    pub generated_content: String,
    pub diff: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallPlanAction {
    Create,
    Modify,
    Skip,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyInstallPlanInput {
    pub repo_path: String,
    pub plan: InstallPlan,
    pub artifacts: Vec<GeneratedArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyInstallPlanResult {
    pub operation_id: String,
    pub applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDriftDetailInput {
    pub artifact_id: Option<String>,
    pub repo_id: Option<String>,
    pub repo_path: String,
    pub target_path: String,
    pub expected_artifact: GeneratedArtifact,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftDetail {
    pub repo_id: Option<String>,
    pub target_path: String,
    pub status: LockfileStatus,
    pub expected_content: String,
    pub current_content: Option<String>,
    pub diff: Option<String>,
}

pub fn shell_boundary() -> &'static str {
    "Tauri is the first shell, not the architecture."
}

pub fn scan_workspace(input: ScanWorkspaceInput) -> MachineScanResult {
    scan_machine(ScanMachineInput {
        roots: vec![input.root_path],
        include_global_agent_folders: false,
    })
}

pub fn scan_machine(input: ScanMachineInput) -> MachineScanResult {
    let roots = expand_roots(input);
    let mut artifacts = Vec::new();
    let mut seen_paths = HashSet::new();

    for root in &roots {
        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(should_descend)
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Some(artifact) = scan_file(&entry) {
                if seen_paths.insert(artifact.path.clone()) {
                    artifacts.push(artifact);
                }
            }
        }
    }

    artifacts.sort_by(|left, right| left.path.cmp(&right.path));

    MachineScanResult { roots, artifacts }
}

pub fn detect_drift(expected_installations: &[ExpectedInstallation]) -> Vec<DriftFinding> {
    expected_installations
        .iter()
        .map(detect_expected_installation_drift)
        .collect()
}

pub fn detect_drift_from_input(input: DetectDriftInput) -> Vec<DriftFinding> {
    detect_drift(&input.expected_installations)
}

pub fn create_install_plan(input: CreateInstallPlanInput) -> InstallPlan {
    let repo_path = PathBuf::from(&input.repo_path);
    let files = input
        .artifacts
        .iter()
        .map(|artifact| plan_file(&repo_path, artifact))
        .collect();

    InstallPlan {
        id: format!(
            "plan:{}:{}:{}",
            input.repo_id, input.blueprint_ref.blueprint_id, input.overlay_hash
        ),
        repo_id: input.repo_id,
        blueprint_id: input.blueprint_ref.blueprint_id,
        files,
        undo_available: true,
        warnings: Vec::new(),
    }
}

pub fn get_drift_detail(input: GetDriftDetailInput) -> DriftDetail {
    let target_path = PathBuf::from(&input.repo_path).join(&input.target_path);
    let current_content = fs::read_to_string(&target_path).ok();
    let expected_content =
        planned_file_content(current_content.as_deref(), &input.expected_artifact);
    let status = match current_content.as_deref() {
        None => LockfileStatus::Missing,
        Some(content)
            if owned_content_hash(content, &input.expected_artifact)
                == input.expected_artifact.content_hash =>
        {
            LockfileStatus::Current
        }
        Some(_) => LockfileStatus::Modified,
    };
    let diff = current_content.as_deref().and_then(|content| {
        if status == LockfileStatus::Current {
            None
        } else {
            Some(simple_diff(content, &expected_content))
        }
    });

    DriftDetail {
        repo_id: input.repo_id,
        target_path: input.target_path,
        status,
        expected_content,
        current_content,
        diff,
    }
}

pub fn apply_install_plan(input: ApplyInstallPlanInput) -> std::io::Result<ApplyInstallPlanResult> {
    let repo_path = PathBuf::from(&input.repo_path);
    for file in &input.plan.files {
        if file.action == InstallPlanAction::Skip {
            continue;
        }
        let target_path = repo_path.join(&file.target_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(target_path, &file.generated_content)?;
    }

    let mut lockfile = read_lockfile(&repo_path).unwrap_or(SkillLockfile {
        version: 1,
        entries: Vec::new(),
    });
    let managed_targets: HashSet<String> = input
        .artifacts
        .iter()
        .map(|artifact| artifact.target_path.clone())
        .collect();
    lockfile
        .entries
        .retain(|entry| !managed_targets.contains(&entry.target_path));

    for artifact in &input.artifacts {
        let target_path = repo_path.join(&artifact.target_path);
        let written_content = fs::read_to_string(&target_path).unwrap_or_default();
        lockfile.entries.push(SkillLockfileEntry {
            blueprint_id: artifact.blueprint_id.clone(),
            blueprint_version: artifact.blueprint_version_id.clone(),
            repo_overlay_hash: artifact.overlay_hash.clone(),
            generated_hash: artifact.content_hash.clone(),
            current_file_hash: Some(owned_content_hash(&written_content, artifact)),
            artifact_target: artifact.artifact_target.clone(),
            target_path: artifact.target_path.clone(),
            schema_version: artifact.schema_version.clone(),
            compiler_version: artifact.compiler_version.clone(),
            status: LockfileStatus::Current,
        });
    }
    write_lockfile(&repo_path, &lockfile)?;

    Ok(ApplyInstallPlanResult {
        operation_id: format!("operation:{}", input.plan.id),
        applied: true,
    })
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

pub fn read_lockfile(repo_root: &Path) -> Option<SkillLockfile> {
    let path = repo_root.join(LOCKFILE_PATH);
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_lockfile(repo_root: &Path, lockfile: &SkillLockfile) -> std::io::Result<()> {
    let path = repo_root.join(LOCKFILE_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut entries = lockfile.entries.clone();
    entries.sort_by(|left, right| left.target_path.cmp(&right.target_path));
    let normalized = SkillLockfile {
        version: lockfile.version,
        entries,
    };
    let content = serde_json::to_string_pretty(&normalized)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?
        + "\n";
    fs::write(path, content)
}

fn expand_roots(input: ScanMachineInput) -> Vec<String> {
    let mut roots = input.roots;
    if input.include_global_agent_folders {
        roots.extend(global_agent_roots());
    }
    roots.sort();
    roots.dedup();
    roots
}

fn global_agent_roots() -> Vec<String> {
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return Vec::new();
    };
    let home_path = PathBuf::from(home);
    [".claude", ".agents", ".codex", ".cursor"]
        .iter()
        .map(|folder| home_path.join(folder).to_string_lossy().to_string())
        .filter(|path| Path::new(path).exists())
        .collect()
}

fn should_descend(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    !SKIP_DIRS.contains(&name.as_ref())
}

fn scan_file(entry: &DirEntry) -> Option<SkillArtifact> {
    let path = entry.path();
    let artifact_target = detect_artifact_target(path)?;
    let content = fs::read_to_string(path).ok()?;
    let canonical_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
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
    let detected_slug = detect_slug(path, name.as_deref(), &content);
    let matched_blueprint_id = if matches_typescript_standards(&content) {
        Some("typescript-standards".to_string())
    } else {
        None
    };
    let source_scope = source_scope_for(path, repo_root.as_deref(), entry);

    Some(SkillArtifact {
        id: hash_string(&canonical_path.to_string_lossy()),
        source_scope,
        artifact_target,
        absolute_path_hash: hash_string(&canonical_path.to_string_lossy()),
        path: normalize_repo_relative_path(&canonical_path),
        repo_relative_path,
        repo_key: repo_root.as_deref().map(repo_key_for_root),
        name,
        description,
        detected_slug,
        content_hash: hash_string(&content),
        normalized_content_hash: hash_normalized_content(&content),
        is_managed: lockfile_entry.is_some(),
        matched_blueprint_id,
        lockfile_status: lockfile_entry.map(|entry| entry.status),
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
    if entry.path_is_symlink() {
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
    read_origin_remote(repo_root)
        .and_then(|remote| normalize_git_remote_url(&remote))
        .map(RepoKey::Github)
        .unwrap_or_else(|| RepoKey::Local(hash_string(&normalize_repo_relative_path(repo_root))))
}

fn read_origin_remote(repo_root: &Path) -> Option<String> {
    let config = fs::read_to_string(repo_root.join(".git/config")).ok()?;
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

fn detect_slug(path: &Path, frontmatter_name: Option<&str>, content: &str) -> Option<String> {
    if let Some(name) = frontmatter_name {
        return Some(slugify(name));
    }
    if path
        .file_name()
        .is_some_and(|name| name.to_string_lossy() == "SKILL.md")
    {
        return path
            .parent()
            .and_then(Path::file_name)
            .map(|name| slugify(&name.to_string_lossy()));
    }
    if matches_typescript_standards(content) {
        return Some("typescript-standards".to_string());
    }
    path.file_stem()
        .map(|stem| slugify(&stem.to_string_lossy()))
}

fn matches_typescript_standards(content: &str) -> bool {
    content.contains("rudel:typescript-standards:")
        || content.contains("typescript-standards")
        || content.contains("TypeScript Standards")
}

fn detect_expected_installation_drift(expected: &ExpectedInstallation) -> DriftFinding {
    let repo_root = PathBuf::from(&expected.repo_path);
    let target_path = repo_root.join(&expected.artifact.target_path);
    let lockfile_entry = read_lockfile(&repo_root).and_then(|lockfile| {
        lockfile
            .entries
            .into_iter()
            .find(|entry| entry.target_path == expected.artifact.target_path)
    });

    let status = match (target_path.exists(), lockfile_entry) {
        (false, _) => LockfileStatus::Missing,
        (true, Some(entry)) if entry.status == LockfileStatus::Forked => LockfileStatus::Forked,
        (true, Some(entry)) => {
            let current_hash = fs::read_to_string(&target_path)
                .map(|content| owned_content_hash(&content, &expected.artifact))
                .unwrap_or_default();
            if entry.blueprint_version != expected.current_blueprint_version_id
                && current_hash != entry.generated_hash
            {
                LockfileStatus::Conflict
            } else if entry.blueprint_version != expected.current_blueprint_version_id {
                LockfileStatus::Behind
            } else if current_hash == expected.artifact.content_hash {
                LockfileStatus::Current
            } else {
                LockfileStatus::Modified
            }
        }
        (true, None) => LockfileStatus::Unmanaged,
    };

    DriftFinding {
        id: hash_string(&format!(
            "{}:{}",
            expected.repo_id, expected.artifact.target_path
        )),
        repo_id: expected.repo_id.clone(),
        blueprint_id: Some(expected.artifact.blueprint_id.clone()),
        artifact_target: Some(expected.artifact.artifact_target.clone()),
        target_path: expected.artifact.target_path.clone(),
        message: drift_message(&status),
        status,
    }
}

fn plan_file(repo_path: &Path, artifact: &GeneratedArtifact) -> InstallPlanFile {
    let target_path = repo_path.join(&artifact.target_path);
    let current = fs::read_to_string(&target_path).ok();
    let generated_content = planned_file_content(current.as_deref(), artifact);
    let current_owned_hash = current
        .as_deref()
        .map(|content| owned_content_hash(content, artifact));
    let action = match current.as_deref() {
        None => InstallPlanAction::Create,
        Some(_) if current_owned_hash.as_deref() == Some(artifact.content_hash.as_str()) => {
            InstallPlanAction::Skip
        }
        Some(_) => InstallPlanAction::Modify,
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

    InstallPlanFile {
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
        let mut output = String::with_capacity(
            current_content.len() - (end - start) + artifact.content.len(),
        );
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

fn drift_message(status: &LockfileStatus) -> String {
    match status {
        LockfileStatus::Current => "File matches the expected generated output.",
        LockfileStatus::Missing => "Lockfile expects this file, but it is missing.",
        LockfileStatus::Modified => "Local file differs from the generated output.",
        LockfileStatus::Behind => "A newer published blueprint version is available.",
        LockfileStatus::Conflict => {
            "Local file is modified and a newer blueprint version is available."
        }
        LockfileStatus::Forked => "This file is intentionally forked from managed updates.",
        LockfileStatus::Unmanaged => "A similar skill exists without a lockfile entry.",
    }
    .to_string()
}

fn normalize_content(content: &str) -> String {
    content.replace("\r\n", "\n")
}

fn hash_string(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
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
        apply_install_plan, create_install_plan, detect_drift, hash_normalized_content,
        normalize_git_remote_url, read_lockfile, scan_machine, write_lockfile,
        ApplyInstallPlanInput, ArtifactTarget, BlueprintRef, CreateInstallPlanInput,
        ExpectedInstallation, GeneratedArtifact, InstallPlanAction, LockfileStatus, RepoKey,
        ScanMachineInput, SkillLockfile, SkillLockfileEntry, SourceScope,
    };
    use std::fs;
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

        let result = scan_machine(ScanMachineInput {
            roots: vec![temp.path().to_string_lossy().to_string()],
            include_global_agent_folders: false,
        });

        assert_eq!(result.artifacts.len(), 2);
        let skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.detected_slug.as_deref() == Some("typescript-standards"))
            .expect("typescript standards artifact");
        assert_eq!(skill.artifact_target, ArtifactTarget::ClaudeCode);
        assert_eq!(
            skill.repo_key,
            Some(RepoKey::Github("github.com/company/api".to_string())),
        );
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

        let result = scan_machine(ScanMachineInput {
            roots: vec![parent.to_string_lossy().to_string()],
            include_global_agent_folders: false,
        });

        let skill = result
            .artifacts
            .iter()
            .find(|artifact| artifact.repo_relative_path.as_deref().is_some())
            .expect("nested skill artifact");
        assert_eq!(skill.name.as_deref(), Some("typescript-standards"));
        assert_eq!(skill.source_scope, SourceScope::NestedRepo);
        assert_eq!(skill.artifact_target, ArtifactTarget::Codex);
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
    fn detect_drift_reports_current_missing_modified_behind_and_conflict() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        let artifact = generated_artifact("current content\n", "v1");
        fs::create_dir_all(repo.join(".claude/skills/typescript-standards"))
            .expect("create skill dir");
        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "current content\r\n",
        )
        .expect("write current");
        write_lockfile(
            &repo,
            &SkillLockfile {
                version: 1,
                entries: vec![SkillLockfileEntry {
                    blueprint_id: "typescript-standards".to_string(),
                    blueprint_version: "v1".to_string(),
                    repo_overlay_hash: "overlay".to_string(),
                    generated_hash: artifact.content_hash.clone(),
                    current_file_hash: Some(artifact.content_hash.clone()),
                    artifact_target: ArtifactTarget::ClaudeCode,
                    target_path: artifact.target_path.clone(),
                    schema_version: "1".to_string(),
                    compiler_version: "1".to_string(),
                    status: LockfileStatus::Current,
                }],
            },
        )
        .expect("write lockfile");

        let current = detect_drift(&[ExpectedInstallation {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            repo_key: None,
            artifact: artifact.clone(),
            current_blueprint_version_id: "v1".to_string(),
        }]);
        assert_eq!(current[0].status, LockfileStatus::Current);

        let missing_artifact = generated_artifact("missing\n", "v1");
        let missing = detect_drift(&[ExpectedInstallation {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            repo_key: None,
            artifact: missing_artifact,
            current_blueprint_version_id: "v1".to_string(),
        }]);
        assert_eq!(missing[0].status, LockfileStatus::Missing);

        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "local edit\n",
        )
        .expect("write edit");
        let modified = detect_drift(&[ExpectedInstallation {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            repo_key: None,
            artifact: artifact.clone(),
            current_blueprint_version_id: "v1".to_string(),
        }]);
        assert_eq!(modified[0].status, LockfileStatus::Modified);

        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "current content\n",
        )
        .expect("restore");
        let behind = detect_drift(&[ExpectedInstallation {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            repo_key: None,
            artifact: artifact.clone(),
            current_blueprint_version_id: "v2".to_string(),
        }]);
        assert_eq!(behind[0].status, LockfileStatus::Behind);

        fs::write(
            repo.join(".claude/skills/typescript-standards/SKILL.md"),
            "local edit\n",
        )
        .expect("edit again");
        let conflict = detect_drift(&[ExpectedInstallation {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            repo_key: None,
            artifact,
            current_blueprint_version_id: "v2".to_string(),
        }]);
        assert_eq!(conflict[0].status, LockfileStatus::Conflict);
    }

    #[test]
    fn create_install_plan_skips_current_and_modifies_drifted_files() {
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

        let plan = create_install_plan(CreateInstallPlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            blueprint_ref: BlueprintRef {
                blueprint_id: "typescript-standards".to_string(),
                blueprint_version_id: "v1".to_string(),
                slug: "typescript-standards".to_string(),
            },
            overlay_hash: "overlay".to_string(),
        });

        assert_eq!(plan.files.len(), 1);
        assert_eq!(plan.files[0].action, InstallPlanAction::Create);
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

        let plan = create_install_plan(CreateInstallPlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            blueprint_ref: BlueprintRef {
                blueprint_id: "typescript-standards".to_string(),
                blueprint_version_id: "v1".to_string(),
                slug: "typescript-standards".to_string(),
            },
            overlay_hash: "overlay".to_string(),
        });

        assert_eq!(plan.files[0].action, InstallPlanAction::Modify);
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

        let plan = create_install_plan(CreateInstallPlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact],
            blueprint_ref: BlueprintRef {
                blueprint_id: "typescript-standards".to_string(),
                blueprint_version_id: "v1".to_string(),
                slug: "typescript-standards".to_string(),
            },
            overlay_hash: "overlay".to_string(),
        });

        assert_eq!(plan.files[0].action, InstallPlanAction::Modify);
        assert!(
            plan.files[0]
                .generated_content
                .contains("# Repo Rules\n\n<!-- rudel:typescript-standards:start -->")
        );
        assert_eq!(plan.files[0].warnings.len(), 1);
    }

    #[test]
    fn apply_install_plan_writes_files_and_lockfile() {
        let temp = tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        let artifact = generated_artifact("expected\n", "v1");
        let plan = create_install_plan(CreateInstallPlanInput {
            repo_id: "repo".to_string(),
            repo_path: repo.to_string_lossy().to_string(),
            artifacts: vec![artifact.clone()],
            blueprint_ref: BlueprintRef {
                blueprint_id: "typescript-standards".to_string(),
                blueprint_version_id: "v1".to_string(),
                slug: "typescript-standards".to_string(),
            },
            overlay_hash: "overlay".to_string(),
        });

        let result = apply_install_plan(ApplyInstallPlanInput {
            repo_path: repo.to_string_lossy().to_string(),
            plan,
            artifacts: vec![artifact.clone()],
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
}
