import { spawn } from "node:child_process";
import { SESSION_TAGS, type SessionTag } from "./types.js";

const SYSTEM_PROMPT = `You are a session classifier. Analyze the Claude Code session transcript and classify it into exactly ONE of these categories:

- research: Exploring codebase, understanding code, answering questions about how things work
- new_feature: Implementing new functionality or features
- bug_fix: Fixing bugs, errors, or unexpected behavior
- refactoring: Restructuring existing code without changing functionality
- documentation: Writing or updating documentation, comments, READMEs
- tests: Writing, updating, or fixing tests

CRITICAL: Respond with ONLY the tag name. Nothing else. No explanation, no punctuation, no formatting. Just ONE of: research, new_feature, bug_fix, refactoring, documentation, tests`;

/**
 * Classify a session transcript using Claude CLI.
 * Returns one of the predefined tags based on the session content.
 *
 * Passes transcript content via stdin to avoid needing file-read permissions.
 */
export async function classifySession(
	content: string,
): Promise<SessionTag | undefined> {
	const truncatedContent = content.slice(0, 50000);
	const prompt = `Classify this session transcript:\n\n${truncatedContent}`;

	try {
		const result = await execWithStdin(
			"claude",
			[
				"--output-format",
				"text",
				"--print",
				"--model",
				"haiku",
				"--no-session-persistence",
				"--system-prompt",
				SYSTEM_PROMPT,
			],
			prompt,
		);

		if (result.exitCode !== 0) {
			return "other";
		}

		const output = result.stdout.trim().toLowerCase();

		if (SESSION_TAGS.includes(output as SessionTag)) {
			return output as SessionTag;
		}

		for (const tag of SESSION_TAGS) {
			if (new RegExp(`\\b${tag}\\b`).test(output)) {
				return tag;
			}
		}

		return "other";
	} catch {
		return undefined;
	}
}

function execWithStdin(
	cmd: string,
	args: string[],
	stdin: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});
		child.on("close", (code) => {
			resolve({ exitCode: code ?? 1, stdout, stderr });
		});
		child.on("error", () => {
			resolve({ exitCode: 1, stdout, stderr });
		});

		child.stdin.write(stdin);
		child.stdin.end();
	});
}
