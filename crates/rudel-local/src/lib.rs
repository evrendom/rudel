pub const PRODUCT_RULE: &str = "Desktop edits skills. Rust writes files. Cloud syncs teams.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanWorkspaceInput {
    pub root_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanWorkspaceOutput {
    pub root_path: String,
    pub repos: Vec<LocalRepoSummary>,
    pub skills: Vec<LocalSkillArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalRepoSummary {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalSkillArtifact {
    pub repo_id: String,
    pub target_path: String,
    pub agent_target: String,
    pub managed: bool,
}

pub fn scan_workspace(input: ScanWorkspaceInput) -> ScanWorkspaceOutput {
    ScanWorkspaceOutput {
        root_path: input.root_path,
        repos: Vec::new(),
        skills: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::{scan_workspace, ScanWorkspaceInput};

    #[test]
    fn scan_workspace_returns_requested_root() {
        let output = scan_workspace(ScanWorkspaceInput {
            root_path: "/tmp/workspace".to_string(),
        });

        assert_eq!(output.root_path, "/tmp/workspace");
        assert!(output.repos.is_empty());
        assert!(output.skills.is_empty());
    }
}
