import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import type { IngestSessionInput, Source } from "../contracts/index.js";
import {
	claudeCodeAdapter,
	getAdapter,
	MissingTranscriptTimestampError,
	type ScannedProject,
	type SessionFile,
} from "../internal/agent-adapters/index.js";
import type { BatchUploadItem } from "../lib/batch-upload.js";
import { renderBatchSummary, runBatchUpload } from "../lib/batch-upload-ui.js";
import { classifySession } from "../lib/classifier.js";
import { type Credentials, loadCredentials } from "../lib/credentials.js";
import {
	isRetryCandidate,
	loadFailedUploads,
	removeFailedUpload,
} from "../lib/failed-uploads.js";
import { getGitInfo } from "../lib/git-info.js";
import { getProjectOrgId } from "../lib/project-config.js";
import { scanAndGroupProjects } from "../lib/project-grouping.js";
import { resolveSession } from "../lib/session-resolver.js";
import {
	DEFAULT_ENDPOINT,
	SESSION_TAGS,
	type SessionTag,
} from "../lib/types.js";
import { allowsInsecureEndpoint } from "../lib/upload-endpoint.js";
import {
	formatRedactionSummary,
	type UploadConfig,
	uploadSession,
} from "../lib/uploader.js";

interface UploadFlags {
	tag?: SessionTag;
	endpoint?: string;
	allowInsecureEndpoint: boolean;
	classify: boolean;
	dryRun: boolean;
	org?: string;
	retry: boolean;
	yes: boolean;
	concurrency: number;
	forceReplace: boolean;
}

interface ResolvedUploadFlags extends UploadFlags {
	endpoint: string;
}

async function runInteractiveUpload(
	flags: ResolvedUploadFlags,
	allowPlaintextEndpoint: boolean,
	credentials: Credentials | null,
): Promise<undefined | Error> {
	p.intro("opaline upload");

	const spin = p.spinner();
	spin.start("Scanning projects...");

	const { projects: allProjects, groups } = await scanAndGroupProjects({
		persistRemoteCache: !flags.dryRun,
	});

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

	if (flags.dryRun) {
		for (const project of selected) {
			p.log.info(
				`Would upload ${sessionCountHint(project.sessionCount)} from [${getAdapterName(project.source)}] ${project.displayPath}`,
			);
		}
		p.outro("Dry run complete — no sessions were uploaded.");
		return;
	}

	if (!credentials) {
		return new Error("Not authenticated. Run `opaline login` first.");
	}

	p.log.info(
		`Uploading ${totalSessions} session(s) from ${selected.length} project(s)`,
	);

	const uploadConfig: UploadConfig = {
		endpoint: flags.endpoint,
		token: credentials.token,
		allowInsecureEndpoint: allowPlaintextEndpoint,
		authType: credentials.authType,
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
			if (flags.forceReplace) request.force_replace = true;

			if (!flags.tag && flags.classify) {
				const classified = await classifySession(request.content);
				if (classified) {
					(request as { tag?: string }).tag = classified;
				}
			}

			return uploadSession(request, { ...uploadConfig, onRetry });
		},
	});

	renderBatchSummary(summary, { showRetryHint: summary.failed > 0 });

	p.outro("Done!");

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
	flags: ResolvedUploadFlags,
	session: string,
	allowPlaintextEndpoint: boolean,
	credentials: Credentials | null,
): Promise<undefined | Error> {
	const write = (msg: string) => {
		process.stdout.write(`${msg}\n`);
	};

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

	let request: IngestSessionInput;
	try {
		request = await claudeCodeAdapter.buildUploadRequest(sessionFile, {
			tag: flags.tag,
			gitInfo,
			organizationId,
			uploadMode: "manual",
		});
	} catch (error) {
		if (error instanceof MissingTranscriptTimestampError) {
			return new Error(
				"This transcript has no timestamped user/assistant messages, so it cannot be uploaded.",
			);
		}
		throw error;
	}

	write(`Transcript: ${request.content.length} bytes`);
	if (request.subagents && request.subagents.length > 0) {
		write(`Subagents: ${request.subagents.length} file(s)`);
	}

	if (flags.forceReplace) request.force_replace = true;

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

	if (!credentials) {
		return new Error("Not authenticated. Run `opaline login` first.");
	}

	if (!flags.tag && flags.classify) {
		write("Classifying session...");
		const classified = await classifySession(request.content);
		if (classified) {
			(request as { tag?: string }).tag = classified;
			write(`Classified as: ${classified}`);
		}
	}

	write("Uploading...");
	const result = await uploadSession(request, {
		endpoint: flags.endpoint,
		token: credentials.token,
		allowInsecureEndpoint: allowPlaintextEndpoint,
		authType: credentials.authType,
	});

	if (result.success) {
		write("Upload successful!");
		await removeFailedUpload(request.sessionId);
		const redactionSummary = formatRedactionSummary(
			result.redacted,
			result.redactedBytes,
		);
		if (redactionSummary) {
			write(redactionSummary);
		}
	} else {
		return new Error(`Upload failed: ${result.error}`);
	}
}

async function runRetryUpload(
	flags: ResolvedUploadFlags,
	allowPlaintextEndpoint: boolean,
	credentials: Credentials | null,
): Promise<undefined | Error> {
	p.intro("opaline upload --retry");

	const failures = await loadFailedUploads();
	if (failures.length === 0) {
		p.outro("No failed uploads to retry.");
		return;
	}

	const retryableFailures = failures.filter((failure) =>
		isRetryCandidate(failure, flags.forceReplace),
	);
	const permanentFailures = failures.filter(
		(failure) => failure.status === "permanent",
	);
	p.log.info(
		`Found ${failures.length} failed upload(s): ${retryableFailures.length} retryable, ${permanentFailures.length} permanent`,
	);
	for (const f of failures.slice(0, 10)) {
		p.log.warn(`  [${f.status}] ${f.sessionId}: ${f.error} (${f.failedAt})`);
	}
	if (failures.length > 10) {
		p.log.warn(`  ...and ${failures.length - 10} more`);
	}
	if (permanentFailures.length > 0) {
		p.log.warn(
			flags.forceReplace
				? "Permanent shrink rejections are promoted by --force-replace; other permanent failures remain recorded."
				: "Permanent failures are retained for visibility and are not retried automatically.",
		);
	}
	if (retryableFailures.length === 0) {
		p.outro("No retryable uploads. Permanent failures remain recorded.");
		return;
	}

	if (flags.dryRun) {
		p.outro(
			`Dry run complete — ${retryableFailures.length} retryable upload(s) were not sent.`,
		);
		return;
	}

	if (!credentials) {
		return new Error("Not authenticated. Run `opaline login` first.");
	}

	if (!flags.yes) {
		const shouldRetry = await p.confirm({
			message: `Retry ${retryableFailures.length} retryable upload(s)?`,
			initialValue: true,
		});

		if (p.isCancel(shouldRetry) || !shouldRetry) {
			p.cancel("Retry cancelled.");
			return;
		}
	}

	type RetryItem = BatchUploadItem & {
		failure: (typeof failures)[number];
	};

	const items: RetryItem[] = retryableFailures.map((f) => ({
		sessionId: f.sessionId,
		label: f.sessionId,
		transcriptPath: f.transcriptPath,
		projectPath: f.projectPath,
		source: f.source,
		organizationId: f.organizationId,
		failure: f,
	}));

	const { token, authType } = credentials;
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
			if (flags.forceReplace) request.force_replace = true;

			return uploadSession(request, {
				endpoint: flags.endpoint,
				token,
				allowInsecureEndpoint: allowPlaintextEndpoint,
				authType,
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
	const credentials = loadCredentials();
	if (!credentials && !flags.dryRun) {
		return new Error("Not authenticated. Run `opaline login` first.");
	}
	const apiBaseUrl = credentials?.apiBaseUrl.replace(/\/+$/u, "");
	const resolvedFlags: ResolvedUploadFlags = {
		...flags,
		endpoint:
			flags.endpoint ??
			(apiBaseUrl === undefined ? DEFAULT_ENDPOINT : `${apiBaseUrl}/rpc`),
	};
	const allowPlaintextEndpoint = allowsInsecureEndpoint(
		resolvedFlags.allowInsecureEndpoint,
	);
	if (resolvedFlags.retry) {
		return runRetryUpload(resolvedFlags, allowPlaintextEndpoint, credentials);
	}
	if (sessions.length === 0) {
		return runInteractiveUpload(
			resolvedFlags,
			allowPlaintextEndpoint,
			credentials,
		);
	}
	return runSingleUpload(
		resolvedFlags,
		sessions[0] as string,
		allowPlaintextEndpoint,
		credentials,
	);
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
				optional: true,
			},
			allowInsecureEndpoint: {
				kind: "boolean",
				brief: "Allow plaintext uploads to a non-loopback endpoint",
				default: false,
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
			yes: {
				kind: "boolean",
				brief: "Skip the confirmation prompt for --retry",
				default: false,
			},
			concurrency: {
				kind: "parsed",
				parse: Number,
				brief: "Max concurrent uploads",
				default: "5",
			},
			forceReplace: {
				kind: "boolean",
				brief: "Intentionally replace a stored session with smaller content",
				default: false,
			},
		},
		aliases: {
			t: "tag",
			c: "classify",
			n: "dryRun",
			o: "org",
			r: "retry",
			y: "yes",
			j: "concurrency",
		},
	},
	docs: {
		brief:
			"Upload session transcripts (Claude Code / Codex). No args = interactive project picker.",
	},
});
