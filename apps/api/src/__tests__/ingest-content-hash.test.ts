import { describe, expect, test } from "bun:test";
import type { IngestSessionInput } from "@rudel/api-routes";
import { computeIngestContentHash } from "../lib/ingest-content-hash.js";

const baseInput: IngestSessionInput = {
	content: "main transcript",
	gitBranch: "main",
	gitRemote: "git@example.com:rudel/repo.git",
	gitSha: "abc123",
	packageName: "rudel",
	packageType: "bun",
	projectPath: "/test/project",
	sessionId: "session-1",
	source: "claude_code",
	subagents: [{ agentId: "agent-1", content: "subagent transcript" }],
	tag: "tests",
};

describe("computeIngestContentHash", () => {
	test("returns the same hash for identical input", () => {
		expect(computeIngestContentHash(baseInput)).toBe(
			computeIngestContentHash(baseInput),
		);
	});

	test("distinguishes adapter source", () => {
		expect(computeIngestContentHash(baseInput)).not.toBe(
			computeIngestContentHash({ ...baseInput, source: "codex" }),
		);
	});

	test("distinguishes persisted content and tag changes", () => {
		const baseline = computeIngestContentHash(baseInput);
		expect(
			computeIngestContentHash({ ...baseInput, content: "changed" }),
		).not.toBe(baseline);
		expect(computeIngestContentHash({ ...baseInput, tag: "bug_fix" })).not.toBe(
			baseline,
		);
	});

	test("includes Claude Code subagent content", () => {
		expect(computeIngestContentHash(baseInput)).not.toBe(
			computeIngestContentHash({
				...baseInput,
				subagents: [{ agentId: "agent-1", content: "changed" }],
			}),
		);
	});

	test("ignores Codex subagents because the adapter does not persist them", () => {
		const codexInput = { ...baseInput, source: "codex" as const };
		expect(computeIngestContentHash(codexInput)).toBe(
			computeIngestContentHash({
				...codexInput,
				subagents: [{ agentId: "different", content: "changed" }],
			}),
		);
	});

	test("treats absent and empty gitRemote identically", () => {
		const { gitRemote: _gitRemote, ...withoutGitRemote } = baseInput;
		expect(computeIngestContentHash(withoutGitRemote)).toBe(
			computeIngestContentHash({ ...withoutGitRemote, gitRemote: "" }),
		);
	});

	test("distinguishes absent and empty nullable gitBranch", () => {
		const { gitBranch: _gitBranch, ...withoutGitBranch } = baseInput;
		expect(computeIngestContentHash(withoutGitBranch)).not.toBe(
			computeIngestContentHash({ ...withoutGitBranch, gitBranch: "" }),
		);
	});

	test("treats absent and empty Claude Code subagent maps identically", () => {
		const { subagents: _subagents, ...withoutSubagents } = baseInput;
		expect(computeIngestContentHash(withoutSubagents)).toBe(
			computeIngestContentHash({ ...withoutSubagents, subagents: [] }),
		);
	});

	test("is order-insensitive for Claude Code subagents", () => {
		const subagents = [
			{ agentId: "agent-a", content: "first" },
			{ agentId: "agent-b", content: "second" },
		];
		expect(computeIngestContentHash({ ...baseInput, subagents })).toBe(
			computeIngestContentHash({
				...baseInput,
				subagents: [...subagents].reverse(),
			}),
		);
	});

	test("the handler computes one hash and reuses it for compare and record", async () => {
		const routerSource = await Bun.file(
			new URL("../router.ts", import.meta.url),
		).text();
		expect(
			routerSource.match(/computeIngestContentHash\(input\)/gu),
		).toHaveLength(1);
		expect(routerSource).toContain(
			"ownership.lastContentSha256 === contentHash",
		);
		expect(routerSource).toContain("contentHash,\n\t\t\t\tingestedAt,");
	});
});
