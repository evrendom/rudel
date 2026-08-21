const CODEX_BODY_TEMPLATE = [
	"---",
	"name: fixture-skill",
	"description: Corpus fixture.",
	"---",
	"",
	"# Fixture skill",
	"",
].join("\n");

function windowsPath(...segments: string[]): string {
	return segments.join("\\");
}

export const CLAUDE_CORPUS_BODIES = {
	bundled: "# Bundled\n\nBundled body.\n",
	crlf: "# CRLF\r\n\r\nWindows newlines stay intact.\r\n",
	huge: `# Huge\n\n${"large-body-line\n".repeat(20_000)}`,
	interleaved: "# Interleaved\n\nRecovered after another tool call.\n",
	plain: "# Plain\n\nPlain body.\n",
	plugin: "# Plugin\n\nPlugin body.\n",
	repeated: "# Repeated\n\nLatest repeated body.\n",
} as const;

export function buildClaudeSkillCorpus(): string {
	return [
		`\uFEFF${claudeInvocation("plain", "2026-08-01T10:00:00.000Z")}`,
		claudeMeta("/Users/test/.claude/skills/plain", CLAUDE_CORPUS_BODIES.plain),
		claudeInvocation("atlas:humanizer", "2026-08-01T10:01:00.000Z"),
		claudeMeta(
			"/Users/test/.claude/plugins/cache/atlas/skills/humanizer",
			CLAUDE_CORPUS_BODIES.plugin,
		),
		claudeInvocation("bundled", "2026-08-01T10:02:00.000Z"),
		claudeMeta(
			"/private/tmp/claude-502/bundled-skills/2.1.220/a2cd57b6e5bf773b955a6e6690326929/bundled",
			CLAUDE_CORPUS_BODIES.bundled,
		),
		claudeInvocation("interleaved", "2026-08-01T10:03:00.000Z"),
		JSON.stringify({
			message: {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						name: "Read",
						input: { file_path: "/tmp/file" },
					},
				],
			},
			timestamp: "2026-08-01T10:03:01.000Z",
			type: "assistant",
		}),
		claudeMeta(
			"/Users/test/.claude/skills/interleaved",
			CLAUDE_CORPUS_BODIES.interleaved,
		),
		claudeInvocation("crlf", "2026-08-01T10:04:00.000Z"),
		claudeMeta(
			windowsPath("C:", "Users", "test", ".claude", "skills", "crlf"),
			CLAUDE_CORPUS_BODIES.crlf,
			true,
		),
		claudeInvocation("huge", "2026-08-01T10:05:00.000Z"),
		claudeMeta("/Users/test/.claude/skills/huge", CLAUDE_CORPUS_BODIES.huge),
		claudeInvocation("repeated", "2026-08-01T10:06:00.000Z"),
		claudeMeta(
			"/Users/test/.claude/skills/repeated",
			"# Repeated\n\nEarlier body.\n",
		),
		claudeInvocation("repeated", "2026-08-01T10:07:00.000Z"),
		claudeMeta(
			"/Users/test/.claude/skills/repeated",
			CLAUDE_CORPUS_BODIES.repeated,
		),
	].join("\n");
}

export function buildCodexSkillCorpus(): string {
	const complete = ["cat-skill", "sed-skill", "head-skill"] as const;
	const lines: string[] = [];
	for (const [index, name] of complete.entries()) {
		const callId = `complete-${index}`;
		const path = `/Users/test/.codex/skills/${name}/SKILL.md`;
		const command =
			name === "cat-skill"
				? `cat ${path}`
				: name === "sed-skill"
					? `sed -n '1,100p' ${path}`
					: `head -n 100 ${path}`;
		lines.push(
			codexCall(callId, command, `2026-08-02T10:0${index}:00.000Z`),
			codexOutput(callId, codexEnvelope(codexBody(name))),
		);
	}
	lines.push(
		codexCall(
			"failed",
			"cat /Users/test/.codex/skills/failed-skill/SKILL.md",
			"2026-08-02T10:03:00.000Z",
		),
		codexOutput(
			"failed",
			codexEnvelope(codexBody("failed-skill"), "Process exited with code 1"),
		),
		codexCall(
			"piped",
			"cat /Users/test/.codex/skills/piped-skill/SKILL.md | head -20",
			"2026-08-02T10:04:00.000Z",
		),
		codexOutput("piped", codexEnvelope(codexBody("piped-skill"))),
	);
	return lines.join("\n");
}

function claudeInvocation(name: string, timestamp: string): string {
	return JSON.stringify({
		message: {
			role: "assistant",
			content: [
				{
					type: "tool_use",
					id: `tool-${name}`,
					name: "Skill",
					input: { skill: name },
				},
			],
		},
		timestamp,
		type: "assistant",
	});
}

function claudeMeta(
	baseDirectory: string,
	body: string,
	arrayContent = false,
): string {
	const text = `Base directory for this skill: ${baseDirectory}\n\n${body}`;
	return JSON.stringify({
		isMeta: true,
		message: {
			role: "user",
			content: arrayContent ? [{ type: "text", text }] : text,
		},
		timestamp: "2026-08-01T10:10:00.000Z",
		type: "user",
	});
}

function codexBody(name: string): string {
	return CODEX_BODY_TEMPLATE.replace("fixture-skill", name);
}

function codexCall(callId: string, command: string, timestamp: string): string {
	return JSON.stringify({
		payload: {
			arguments: JSON.stringify({ cmd: command }),
			call_id: callId,
			name: "exec_command",
			type: "function_call",
		},
		timestamp,
		type: "response_item",
	});
}

function codexOutput(callId: string, output: string): string {
	return JSON.stringify({
		payload: { call_id: callId, output, type: "function_call_output" },
		type: "response_item",
	});
}

function codexEnvelope(
	body: string,
	processLine = "Process exited with code 0",
): string {
	return ["Chunk ID: corpus", processLine, "Final output:", body].join("\n");
}
