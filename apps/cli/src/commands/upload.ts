import * as p from "@clack/prompts";
import {
	claudeCodeAdapter,
	getAdapter,
	type ScannedProject,
	type SessionFile,
} from "@rudel/agent-adapters";
import type { Source } from "@rudel/api-routes";
import { buildCommand } from "@stricli/core";
import type { BatchUploadItem } from "../lib/batch-upload.js";
import { renderBatchSummary, runBatchUpload } from "../lib/batch-upload-ui.js";
import { classifySession } from "../lib/classifier.js";
import { loadCredentials } from "../lib/credentials.js";
import { loadFailedUploads } from "../lib/failed-uploads.js";
import { getGitInfo } from "../lib/git-info.js";
import { getProjectOrgId } from "../lib/project-config.js";
import { scanAndGroupProjects } from "../lib/project-grouping.js";
import { resolveSession } from "../lib/session-resolver.js";
import {
	DEFAULT_ENDPOINT,
	SESSION_TAGS,
	type SessionTag,
} from "../lib/types.js";
import { type UploadConfig, uploadSession } from "../lib/uploader.js";

interface UploadFlags {
	tag?: SessionTag;
	endpoint: string;
	classify: boolean;
	dryRun: boolean;
	org?: string;
	retry: boolean;
	concurrency: number;
}

async function runInteractiveUpload(
	flags: UploadFlags,
): Promise<undefined | Error> {
	const credentials = loadCredentials();
	if (!credentials && !flags.dryRun) {
		return new Error("Not authenticated. Run `rudel login` first.");
	}

	p.intro("rudel upload");

	const spin = p.spinner();
	spin.start("Scanning projects...");

	const { projects: allProjects, groups } = await scanAndGroupProjects();

	spin.stop(`Found ${allProjects.length} project(s)`);

	if (allProjects.length === 0) {
		p.log.warn("No projects with sessions found.");
		p.outro("Nothing to upload.");
		return;
	}

	const options: Array<{
		value: ScannedProject;
		label: string;
		hint: string;
	}> = [];
	const preSelected: ScannedProject[] = [];

	for (const group of groups) {
		for (const proj of group.projects) {
			options.push({
				value: proj,
				label: `[${getAdapterName(proj.source)}] ${proj.displayPath}`,
				hint: sessionCountHint(proj.sessionCount),
			});
			if (group.containsCwd) {
				preSelected.push(proj);
			}
		}
	}

	const selected = await p.multiselect({
		message: "Select projects to upload",
		options,
		initialValues: preSelected,
		required: true,
	});

	if (p.isCancel(selected)) {
		p.cancel("Upload cancelled.");
		return;
	}

	const totalSessions = selected.reduce(
		(sum, proj) => sum + proj.sessionCount,
		0,
	);
	p.log.info(
		`Uploading ${totalSessions} session(s) from ${selected.length} project(s)`,
	);

	const uploadConfig: UploadConfig = {
		endpoint: flags.endpoint,
		token: credentials?.token ?? "",
		authType: credentials?.authType,
	};

	// Flatten all sessions with their project context for concurrent upload
	const work: Array<{
		session: (typeof selected)[number]["sessions"][number];
		project: ScannedProject;
		adapter: ReturnType<typeof getAdapter>;
		gitInfo: Awaited<ReturnType<typeof getGitInfo>>;
		organizationId: string | undefined;
	}> = [];

	for (const project of selected) {
		const adapter = getAdapter(project.source);
		const gitInfo = await getGitInfo(project.projectPath);
		const organizationId =
			flags.org ?? (await getProjectOrgId(project.projectPath));
		for (const session of project.sessions) {
			work.push({ session, project, adapter, gitInfo, organizationId });
		}
	}

	type InteractiveItem = BatchUploadItem & {
		session: (typeof work)[number]["session"];
		adapter: (typeof work)[number]["adapter"];
		gitInfo: (typeof work)[number]["gitInfo"];
	};

	const items: InteractiveItem[] = work.map((w) => ({
		sessionId: w.session.sessionId,
		label: `${w.project.displayPath}/${w.session.sessionId}`,
		transcriptPath: w.session.transcriptPath,
		projectPath: w.session.projectPath,
		source: w.project.source,
		organizationId: w.organizationId,
		session: w.session,
		adapter: w.adapter,
		gitInfo: w.gitInfo,
	}));

	const summary = await runBatchUpload({
		items,
		label: "Uploading sessions...",
		concurrency: flags.concurrency,
		upload: async (item, onRetry) => {
			const request = await item.adapter.buildUploadRequest(item.session, {
				tag: flags.tag,
				gitInfo: item.gitInfo,
				organizationId: item.organizationId,
				uploadMode: "manual",
			});

			if (!flags.tag && flags.classify) {
				const classified = await classifySession(request.content);
				if (classified) {
					(request as { tag?: string }).tag = classified;
				}
			}

			if (flags.dryRun) {
				return { success: true };
			}

			return uploadSession(request, { ...uploadConfig, onRetry });
		},
	});

	renderBatchSummary(summary, { showRetryHint: summary.failed > 0 });

	if (flags.dryRun) {
		p.outro("Dry run complete — no sessions were uploaded.");
	} else {
		p.outro("Done!");
	}

	if (summary.failed > 0) {
		return new Error(`${summary.failed} upload(s) failed.`);
	}
}

function getAdapterName(source: Source): string {
	return getAdapter(source).name;
}

function sessionCountHint(count: number): string {
	return `${count} session${count !== 1 ? "s" : ""}`;
}

async function runSingleUpload(
	flags: UploadFlags,
	session: string,
): Promise<undefined | Error> {
	const write = (msg: string) => {
		process.stdout.write(`${msg}\n`);
	};

	const credentials = loadCredentials();
	if (!credentials && !flags.dryRun) {
		return new Error("Not authenticated. Run `rudel login` first.");
	}

	write(`Resolving session: ${session}`);
	let sessionInfo: Awaited<ReturnType<typeof resolveSession>>;
	try {
		sessionInfo = await resolveSession(session);
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
	write(`Found session at: ${sessionInfo.transcriptPath}`);

	const gitInfo = await getGitInfo(sessionInfo.projectPath);
	const displayName =
		gitInfo.gitRemote ||
		gitInfo.packageName ||
		sessionInfo.projectPath.split("/").pop();
	if (displayName) write(`Repository: ${displayName}`);
	if (gitInfo.branch) write(`Branch: ${gitInfo.branch}`);

	const organizationId =
		flags.org ?? (await getProjectOrgId(sessionInfo.projectPath));
	if (organizationId) write(`Organization: ${organizationId}`);

	write("Building upload request...");
	const sessionFile: SessionFile = {
		sessionId: sessionInfo.sessionId,
		transcriptPath: sessionInfo.transcriptPath,
		projectPath: sessionInfo.projectPath,
	};

	const request = await claudeCodeAdapter.buildUploadRequest(sessionFile, {
		tag: flags.tag,
		gitInfo,
		organizationId,
		uploadMode: "manual",
	});

	write(`Transcript: ${request.content.length} bytes`);
	if (request.subagents && request.subagents.length > 0) {
		write(`Subagents: ${request.subagents.length} file(s)`);
	}

	if (!flags.tag && flags.classify) {
		write("Classifying session...");
		const classified = await classifySession(request.content);
		if (classified) {
			(request as { tag?: string }).tag = classified;
			write(`Classified as: ${classified}`);
		}
	}

	if (flags.dryRun) {
		const preview = {
			...request,
			content: `[${request.content.length} bytes]`,
			subagents: request.subagents?.map((s) => ({
				...s,
				content: `[${s.content.length} bytes]`,
			})),
		};
		write("Dry run - would upload:");
		write(JSON.stringify(preview, null, 2));
		return;
	}

	write("Uploading...");
	const result = await uploadSession(request, {
		endpoint: flags.endpoint,
		// biome-ignore lint/style/noNonNullAssertion: validated above with early return
		token: credentials!.token,
		authType: credentials?.authType,
	});

	if (result.success) {
		write("Upload successful!");
	} else {
		return new Error(`Upload failed: ${result.error}`);
	}
}

async function runRetryUpload(flags: UploadFlags): Promise<undefined | Error> {
	const credentials = loadCredentials();
	if (!credentials) {
		return new Error("Not authenticated. Run `rudel login` first.");
	}

	p.intro("rudel upload --retry");

	const failures = await loadFailedUploads();
	if (failures.length === 0) {
		p.outro("No failed uploads to retry.");
		return;
	}

	p.log.info(`Found ${failures.length} failed upload(s):`);
	for (const f of failures.slice(0, 10)) {
		p.log.warn(`  ${f.sessionId}: ${f.error} (${f.failedAt})`);
	}
	if (failures.length > 10) {
		p.log.warn(`  ...and ${failures.length - 10} more`);
	}

	const shouldRetry = await p.confirm({
		message: `Retry all ${failures.length} failed upload(s)?`,
		initialValue: true,
	});

	if (p.isCancel(shouldRetry) || !shouldRetry) {
		p.cancel("Retry cancelled.");
		return;
	}

	const endpoint = flags.endpoint;

	type RetryItem = BatchUploadItem & {
		failure: (typeof failures)[number];
	};

	const items: RetryItem[] = failures.map((f) => ({
		sessionId: f.sessionId,
		label: f.sessionId,
		transcriptPath: f.transcriptPath,
		projectPath: f.projectPath,
		source: f.source,
		organizationId: f.organizationId,
		failure: f,
	}));

	const summary = await runBatchUpload({
		items,
		label: "Retrying uploads...",
		concurrency: flags.concurrency,
		upload: async (item, onRetry) => {
			const adapter = item.failure.source
				? getAdapter(item.failure.source)
				: claudeCodeAdapter;
			const sessionFile: SessionFile = {
				sessionId: item.failure.sessionId,
				transcriptPath: item.failure.transcriptPath,
				projectPath: item.failure.projectPath,
			};
			const gitInfo = await getGitInfo(item.failure.projectPath);
			const organizationId =
				flags.org ??
				item.failure.organizationId ??
				(await getProjectOrgId(item.failure.projectPath));

			const request = await adapter.buildUploadRequest(sessionFile, {
				tag: flags.tag,
				gitInfo,
				organizationId,
				uploadMode: "retry",
			});

			return uploadSession(request, {
				endpoint,
				token: credentials.token,
				authType: credentials.authType,
				onRetry,
			});
		},
	});

	renderBatchSummary(summary);

	p.outro("Done!");

	if (summary.failed > 0) {
		return new Error(`${summary.failed} upload(s) failed.`);
	}
}

async function runUpload(
	flags: UploadFlags,
	...sessions: string[]
): Promise<undefined | Error> {
	if (flags.retry) {
		return runRetryUpload(flags);
	}
	if (sessions.length === 0) {
		return runInteractiveUpload(flags);
	}
	return runSingleUpload(flags, sessions[0] as string);
}

export const uploadCommand = buildCommand({
	loader: async () => ({ default: runUpload }),
	parameters: {
		positional: {
			kind: "array",
			parameter: {
				brief: "Session ID or path to a session .jsonl file",
				parse: String,
				placeholder: "session",
			},
		},
		flags: {
			tag: {
				kind: "enum",
				values: [...SESSION_TAGS],
				brief: "Session tag/category",
				optional: true,
			},
			endpoint: {
				kind: "parsed",
				parse: String,
				brief: "Override the upload endpoint URL",
				default: DEFAULT_ENDPOINT,
			},
			classify: {
				kind: "boolean",
				brief: "Auto-classify session tag using Claude CLI",
				default: false,
			},
			dryRun: {
				kind: "boolean",
				brief: "Preview what would be uploaded without sending",
				default: false,
			},
			org: {
				kind: "parsed",
				parse: String,
				brief: "Override the organization ID to upload to",
				optional: true,
			},
			retry: {
				kind: "boolean",
				brief: "Retry previously failed uploads",
				default: false,
			},
			concurrency: {
				kind: "parsed",
				parse: Number,
				brief: "Max concurrent uploads",
				default: "5",
			},
		},
		aliases: {
			t: "tag",
			c: "classify",
			n: "dryRun",
			o: "org",
			r: "retry",
			j: "concurrency",
		},
	},
	docs: {
		brief:
			"Upload session transcripts (Claude Code / Codex). No args = interactive project picker.",
	},
});
