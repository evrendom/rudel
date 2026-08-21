import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPlaygroundPaths } from "./paths.js";
import type { FixtureVariant } from "./types.js";

const FIXTURE_VARIANTS: readonly FixtureVariant[] = [
	"empty",
	"hooks-enabled",
	"huge",
	"retry-queue",
	"signed-out",
	"standard",
];

export interface GeneratedFixture {
	readonly firstTranscript: string | null;
	readonly projectPaths: readonly string[];
}

export async function generateAllFixtures(): Promise<void> {
	for (const variant of FIXTURE_VARIANTS) {
		await generateFixture(variant);
	}
}

export async function generateFixture(
	variant: FixtureVariant,
): Promise<GeneratedFixture> {
	const paths = getPlaygroundPaths("fixture", variant);
	await Promise.all([
		mkdir(paths.claudeSessions, { recursive: true }),
		mkdir(paths.codexSessions, { recursive: true }),
		mkdir(paths.workdir, { recursive: true }),
	]);
	await chmod(paths.fixtureRoot, 0o700);

	if (variant === "empty") {
		return { firstTranscript: null, projectPaths: [] };
	}
	if (variant === "huge") {
		return generateHugeFixture(paths.fixtureRoot, paths.claudeSessions);
	}
	return generateStandardFixture(
		paths.fixtureRoot,
		paths.claudeSessions,
		paths.codexSessions,
		paths.workdir,
	);
}

async function generateStandardFixture(
	fixtureRoot: string,
	claudeSessionsDir: string,
	codexSessionsDir: string,
	workdir: string,
): Promise<GeneratedFixture> {
	const projects = [
		workdir,
		join(fixtureRoot, "conductor", "workspaces", "rudel-v2", "berlin"),
		join(fixtureRoot, "conductor", "workspaces", "rudel-v2", "opaline"),
		join(fixtureRoot, "projects", "checkout-api"),
		join(fixtureRoot, "projects", "zero-session-project"),
	];
	for (const projectPath of projects) {
		await mkdir(projectPath, { recursive: true });
	}

	const transcriptPaths: string[] = [];
	for (let index = 0; index < 6; index++) {
		transcriptPaths.push(
			await writeClaudeTranscript(
				claudeSessionsDir,
				workdir,
				`fixture-current-${String(index + 1).padStart(2, "0")}`,
				index,
			),
		);
	}
	for (let index = 0; index < 3; index++) {
		transcriptPaths.push(
			await writeClaudeTranscript(
				claudeSessionsDir,
				projects[1] ?? workdir,
				`fixture-api-${String(index + 1).padStart(2, "0")}`,
				index + 10,
			),
		);
	}
	transcriptPaths.push(
		await writeClaudeTranscript(
			claudeSessionsDir,
			projects[2] ?? workdir,
			"fixture-unicode-01",
			20,
		),
	);
	for (let index = 0; index < 4; index++) {
		transcriptPaths.push(
			await writeCodexTranscript(
				codexSessionsDir,
				projects[index % 3] ?? workdir,
				`fixture-codex-${String(index + 1).padStart(2, "0")}`,
				index + 30,
			),
		);
	}

	return {
		firstTranscript: transcriptPaths[0] ?? null,
		projectPaths: projects,
	};
}

async function generateHugeFixture(
	fixtureRoot: string,
	claudeSessionsDir: string,
): Promise<GeneratedFixture> {
	const projectPaths: string[] = [];
	let firstTranscript: string | null = null;
	for (let index = 0; index < 200; index++) {
		const projectPath = join(
			fixtureRoot,
			"projects",
			`portfolio-segment-${String(index % 12).padStart(2, "0")}`,
			`project-${String(index + 1).padStart(3, "0")}-with-a-realistically-long-name`,
		);
		await mkdir(projectPath, { recursive: true });
		projectPaths.push(projectPath);
		const transcript = await writeClaudeTranscript(
			claudeSessionsDir,
			projectPath,
			`fixture-scale-${String(index + 1).padStart(3, "0")}`,
			index,
		);
		firstTranscript = firstTranscript ?? transcript;
	}
	return { firstTranscript, projectPaths };
}

async function writeClaudeTranscript(
	sessionsRoot: string,
	projectPath: string,
	sessionId: string,
	dayOffset: number,
): Promise<string> {
	const sessionDir = join(sessionsRoot, encodeClaudeProjectPath(projectPath));
	const transcriptPath = join(sessionDir, `${sessionId}.jsonl`);
	await mkdir(sessionDir, { recursive: true });
	const startedAt = fixtureTimestamp(dayOffset, 9);
	const finishedAt = fixtureTimestamp(dayOffset, 10);
	const padding = "Fixture transcript detail. ".repeat((dayOffset % 7) + 1);
	await writeFile(
		transcriptPath,
		[
			JSON.stringify({
				type: "user",
				sessionId,
				uuid: `${sessionId}-user`,
				timestamp: startedAt,
				message: {
					role: "user",
					content: `Design request ${sessionId}. ${padding}`,
				},
			}),
			JSON.stringify({
				type: "assistant",
				sessionId,
				uuid: `${sessionId}-assistant`,
				timestamp: finishedAt,
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: `Completed ${sessionId}. ${padding}` },
					],
				},
			}),
		].join("\n"),
		{ mode: 0o600 },
	);
	return transcriptPath;
}

async function writeCodexTranscript(
	sessionsRoot: string,
	projectPath: string,
	sessionId: string,
	dayOffset: number,
): Promise<string> {
	const sessionDir = join(sessionsRoot, "2026", "08", "20");
	const transcriptPath = join(sessionDir, `${sessionId}.jsonl`);
	await mkdir(sessionDir, { recursive: true });
	await writeFile(
		transcriptPath,
		[
			JSON.stringify({
				timestamp: fixtureTimestamp(dayOffset, 9),
				type: "session_meta",
				payload: {
					id: sessionId,
					cwd: projectPath,
					git: { branch: "playground", sha: "0123456789abcdef" },
				},
			}),
			JSON.stringify({
				timestamp: fixtureTimestamp(dayOffset, 10),
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [
						{ type: "output_text", text: `Fixture result ${sessionId}` },
					],
				},
			}),
		].join("\n"),
		{ mode: 0o600 },
	);
	return transcriptPath;
}

function encodeClaudeProjectPath(projectPath: string): string {
	return projectPath.replaceAll("/", "-");
}

function fixtureTimestamp(dayOffset: number, hour: number): string {
	const date = new Date("2026-01-01T00:00:00.000Z");
	date.setUTCDate(date.getUTCDate() + (dayOffset % 220));
	date.setUTCHours(hour);
	return date.toISOString();
}

if (import.meta.main) {
	await generateAllFixtures();
	console.log("Generated CLI design-playground fixtures.");
}
