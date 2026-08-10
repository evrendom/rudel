import { describe, expect, test } from "bun:test";
import { resolveRepoIdentity } from "../repo-identity.js";

describe("resolveRepoIdentity", () => {
	test("uses the Conductor repo token before the git remote", () => {
		expect(
			resolveRepoIdentity({
				projectPath: "/Users/x/conductor/workspaces/rudel-v2/podgorica",
				gitRemote: "github.com/evrendom/rudel",
				packageName: null,
			}),
		).toEqual({
			repoKey: "path:rudel-v2",
			repoLabel: "rudel-v2",
			worktree: "podgorica",
		});
	});

	test("resolves a cwd below the Conductor worktree root", () => {
		expect(
			resolveRepoIdentity({
				projectPath:
					"/Users/x/conductor/workspaces/rudel-v2/podgorica/apps/web",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual({
			repoKey: "path:rudel-v2",
			repoLabel: "rudel-v2",
			worktree: "podgorica",
		});
	});

	test("resolves generic dot-worktrees paths", () => {
		const expected = {
			repoKey: "path:myrepo",
			repoLabel: "myrepo",
			worktree: "feature-x",
		};

		expect(
			resolveRepoIdentity({
				projectPath: "/Users/x/dev/myrepo/.worktrees/feature-x",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual(expected);
		expect(
			resolveRepoIdentity({
				projectPath: "C:\\Users\\x\\dev\\myrepo\\.worktrees\\feature-x",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual(expected);
	});

	test("falls back through remote, package, path, and empty identities", () => {
		expect(
			resolveRepoIdentity({
				projectPath: "/tmp/checkout",
				gitRemote: "github.com/owner/repo",
				packageName: "ignored-package",
			}),
		).toEqual({
			repoKey: "remote:github.com/owner/repo",
			repoLabel: "owner/repo",
			worktree: null,
		});
		expect(
			resolveRepoIdentity({
				projectPath: "/tmp/checkout",
				gitRemote: null,
				packageName: "@rudel/web",
			}),
		).toEqual({
			repoKey: "pkg:@rudel/web",
			repoLabel: "@rudel/web",
			worktree: null,
		});
		expect(
			resolveRepoIdentity({
				projectPath: "/Users/x/dev/myrepo",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual({
			repoKey: "path-raw:/Users/x/dev/myrepo",
			repoLabel: "dev/myrepo",
			worktree: null,
		});
		expect(
			resolveRepoIdentity({
				projectPath: "",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual({
			repoKey: "path-raw:",
			repoLabel: "Untitled project",
			worktree: null,
		});
	});

	test("does not add special handling for Vibe Kanban or Gastown paths", () => {
		expect(
			resolveRepoIdentity({
				projectPath: "/var/folders/zz/T/vibe-kanban/worktrees/abc123-task",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual({
			repoKey: "path-raw:/var/folders/zz/T/vibe-kanban/worktrees/abc123-task",
			repoLabel: "worktrees/abc123-task",
			worktree: null,
		});
		expect(
			resolveRepoIdentity({
				projectPath: "/Users/x/gt/rudel/polecats/worker-1",
				gitRemote: null,
				packageName: null,
			}),
		).toEqual({
			repoKey: "path-raw:/Users/x/gt/rudel/polecats/worker-1",
			repoLabel: "polecats/worker-1",
			worktree: null,
		});
	});
});
