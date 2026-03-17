import * as p from "@clack/prompts";
import { type AgentAdapter, getAvailableAdapters } from "@rudel/agent-adapters";
import type { Source } from "@rudel/api-routes";
import { buildCommand } from "@stricli/core";
import { createApiClient } from "../lib/api-client.js";
import { verifyAuth } from "../lib/auth.js";
import type { BatchUploadItem } from "../lib/batch-upload.js";
import { renderBatchSummary, runBatchUpload } from "../lib/batch-upload-ui.js";
import { getGitInfo } from "../lib/git-info.js";
import {
	CliProductAnalyticsEvents,
	captureCliProductAnalyticsEvent,
	getBaseCliEventPayload,
	getCliDistinctId,
	normalizeFailureReason,
	shouldDisableCliPersonProfile,
} from "../lib/product-analytics.js";
import { getProjectOrgId, setProjectOrgId } from "../lib/project-config.js";
import { uploadSession } from "../lib/uploader.js";

async function runEnable(): Promise<void> {
	p.intro("rudel enable");

	const captureEnableFailure = (options: {
		agentSource?: Source | "unknown";
		failureStage:
			| "auth_verify"
			| "organization_fetch"
			| "organization_select"
			| "hook_install";
		error: unknown;
		organizationId?: string;
		userId?: string;
	}) => {
		captureCliProductAnalyticsEvent({
			distinctId: getCliDistinctId(options.userId),
			event: CliProductAnalyticsEvents.AUTO_UPLOAD_ENABLE_FAILED,
			surface: "cli",
			disablePersonProfile: shouldDisableCliPersonProfile(options.userId),
			payload: {
				agent_source: options.agentSource ?? "unknown",
				failure_stage: options.failureStage,
				failure_reason: normalizeFailureReason(options.error),
				organization_id: options.organizationId,
				user_id: options.userId,
				...getBaseCliEventPayload(),
			},
		});
	};

	// Verify auth (loads credentials + pings API)
	const auth = await verifyAuth();
	if (!auth.authenticated) {
		captureEnableFailure({
			failureStage: "auth_verify",
			error: auth.reason,
		});
		p.log.error(auth.message);
		p.outro("Run `rudel login` to authenticate.");
		process.exitCode = 1;
		return;
	}

	const { credentials } = auth;

	// Fetch user's organizations
	let orgs: { id: string; name: string; slug: string }[];
	if (credentials.authType === "api-key") {
		orgs = credentials.organizations ?? [];
	} else {
		const client = createApiClient(credentials);
		try {
			orgs = await client.listMyOrganizations();
		} catch (error) {
			captureEnableFailure({
				agentSource: "unknown",
				failureStage: "organization_fetch",
				error,
				userId: auth.user.id,
			});
			p.log.error("Failed to fetch organizations. Check your connection.");
			process.exitCode = 1;
			return;
		}
	}

	if (orgs.length === 0) {
		captureEnableFailure({
			agentSource: "unknown",
			failureStage: "organization_fetch",
			error: new Error("No organizations found"),
			userId: auth.user.id,
		});
		p.log.error("No organizations found.");
		p.outro("Create one at app.rudel.ai first.");
		process.exitCode = 1;
		return;
	}

	// Check if already configured for this project
	const cwd = process.cwd();
	const existingOrgId = await getProjectOrgId(cwd);
	const existingOrg = existingOrgId
		? orgs.find((o) => o.id === existingOrgId)
		: undefined;

	let selectedOrgId: string;

	const [firstOrg] = orgs;
	if (orgs.length === 1 && firstOrg) {
		selectedOrgId = firstOrg.id;
		p.log.info(`Using organization: ${firstOrg.name}`);
	} else if (existingOrg) {
		p.log.info(`Currently configured for: ${existingOrg.name}`);
		selectedOrgId = existingOrg.id;
	} else {
		const selected = await p.select({
			message: "Select an organization for this repository",
			options: orgs.map((org) => ({
				value: org.id,
				label: org.name,
				hint: org.slug,
			})),
		});

		if (p.isCancel(selected)) {
			p.cancel("Setup cancelled.");
			return;
		}

		selectedOrgId = selected;
		const selectedOrg = orgs.find((o) => o.id === selected);
		if (selectedOrg) {
			p.log.success(`Selected: ${selectedOrg.name}`);
		}
	}

	await setProjectOrgId(cwd, selectedOrgId);

	// Detect available agents and install hooks
	const adapters = getAvailableAdapters();
	let adaptersToEnable: AgentAdapter[];
	let hookInstallFailures = 0;

	if (adapters.length > 1) {
		const agentOptions = adapters.map((a) => ({
			value: a,
			label: a.name,
			hint: a.isHookInstalled() ? "already enabled" : undefined,
		}));
		const selectedAdapters = await p.multiselect({
			message: "Select agents to enable auto-upload for",
			options: agentOptions,
			initialValues: adapters,
			required: true,
		});

		if (p.isCancel(selectedAdapters)) {
			p.cancel("Setup cancelled.");
			return;
		}
		adaptersToEnable = selectedAdapters;
	} else {
		adaptersToEnable = adapters;
	}

	for (const adapter of adaptersToEnable) {
		const isAlreadyEnabled = adapter.isHookInstalled();

		if (isAlreadyEnabled) {
			p.log.info(
				`${adapter.name}: Auto-upload hook is already enabled. Organization updated.`,
			);
		} else {
			try {
				adapter.installHook();
				p.log.success(
					`${adapter.name}: Auto-upload hook enabled in ${adapter.getHookConfigPath()}`,
				);
			} catch (error) {
				hookInstallFailures++;
				captureEnableFailure({
					agentSource: adapter.source,
					failureStage: "hook_install",
					error,
					organizationId: selectedOrgId,
					userId: auth.user.id,
				});
				p.log.error(
					`${adapter.name}: failed to enable auto-upload hook (${error instanceof Error ? error.message : String(error)})`,
				);
				continue;
			}
		}

		captureCliProductAnalyticsEvent({
			distinctId: auth.user.id,
			event: CliProductAnalyticsEvents.AUTO_UPLOAD_ENABLED,
			surface: "cli",
			payload: {
				organization_id: selectedOrgId,
				user_id: auth.user.id,
				agent_source: adapter.source,
				is_already_enabled: isAlreadyEnabled || undefined,
				...getBaseCliEventPayload(),
			},
		});
	}

	// Check for existing sessions to upload from all enabled agents
	const endpoint = `${credentials.apiBaseUrl}/rpc`;
	let totalFailed = 0;

	for (const adapter of adaptersToEnable) {
		const sessions = await adapter.findProjectSessions(cwd);
		if (sessions.length === 0) continue;

		const shouldUpload = await p.confirm({
			message: `Found ${sessions.length} previous ${adapter.name} session(s). Upload them now?`,
			initialValue: false,
		});

		if (p.isCancel(shouldUpload) || !shouldUpload) continue;

		const gitInfo = await getGitInfo(cwd);

		const items: BatchUploadItem[] = sessions.map((session) => ({
			sessionId: session.sessionId,
			label: session.sessionId,
			transcriptPath: session.transcriptPath,
			projectPath: session.projectPath,
			source: adapter.source,
			organizationId: selectedOrgId,
		}));

		const summary = await runBatchUpload({
			items,
			label: `Uploading ${adapter.name} sessions...`,
			upload: async (item, onRetry) => {
				const session = sessions.find((s) => s.sessionId === item.sessionId);
				if (!session) {
					return { success: false, error: "Session not found" };
				}
				try {
					const request = await adapter.buildUploadRequest(session, {
						gitInfo,
						organizationId: selectedOrgId,
					});
					return uploadSession(request, {
						endpoint,
						token: credentials.token,
						authType: credentials.authType,
						onRetry,
					});
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
		});

		renderBatchSummary(summary, { context: adapter.name });
		totalFailed += summary.failed;
	}

	if (totalFailed > 0) {
		p.log.info("Run `rudel upload --retry` to retry failed uploads.");
	}

	p.outro("Done!");

	if (totalFailed > 0 || hookInstallFailures > 0) {
		process.exitCode = 1;
	}
}

export const enableCommand = buildCommand({
	loader: async () => ({ default: runEnable }),
	parameters: {},
	docs: {
		brief: "Enable automatic session upload for coding agents",
	},
});
