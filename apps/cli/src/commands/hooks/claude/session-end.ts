import { getLogger } from "@logtape/logtape";
import { claudeCodeAdapter, type SessionFile } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import { buildCommand } from "@stricli/core";
import { loadCredentials } from "../../../lib/credentials.js";
import {
	recordFailedUpload,
	removeFailedUpload,
} from "../../../lib/failed-uploads.js";
import { getGitInfo } from "../../../lib/git-info.js";
import {
	captureCliUploadFailed,
	captureCliUploadSkipped,
	getCliUserId,
	getUploadPreparationFailureStage,
} from "../../../lib/product-analytics.js";
import { getProjectOrgId } from "../../../lib/project-config.js";
import { uploadSession } from "../../../lib/uploader.js";
import { disposeLogging, setupHookLogging } from "../../../logging.js";

interface HookInput {
	session_id: string;
	transcript_path: string;
	cwd: string;
}

async function readStdin(): Promise<string> {
	const chunks: string[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
	}
	return chunks.join("");
}

async function runSessionEnd(): Promise<void> {
	await setupHookLogging();
	const logger = getLogger(["rudel", "cli", "hook"]);

	try {
		const raw = await readStdin();
		if (!raw.trim()) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "missing_input",
			});
			return;
		}

		const input = JSON.parse(raw) as HookInput;
		if (!input.session_id || !input.transcript_path) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "missing_input",
				projectPath: input.cwd || process.cwd(),
			});
			return;
		}

		const credentials = loadCredentials();
		if (!credentials) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "not_authenticated",
				projectPath: input.cwd,
			});
			return;
		}

		logger.info("Uploading session {sessionId}", {
			sessionId: input.session_id,
		});

		const sessionFile: SessionFile = {
			sessionId: input.session_id,
			transcriptPath: input.transcript_path,
			projectPath: input.cwd,
		};

		const gitInfo = await getGitInfo(input.cwd);
		const organizationId = await getProjectOrgId(input.cwd);

		let request: IngestSessionInput;
		try {
			request = await claudeCodeAdapter.buildUploadRequest(sessionFile, {
				gitInfo,
				organizationId,
			});
		} catch (error) {
			captureCliUploadFailed({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				failureStage: getUploadPreparationFailureStage(error),
				error,
				organizationId,
				userId: getCliUserId(credentials),
				projectPath: input.cwd,
			});
			logger.error(
				"Failed to prepare upload for session {sessionId}: {error}",
				{
					sessionId: input.session_id,
					error,
				},
			);
			return;
		}

		const apiBase = process.env.RUDEL_API_BASE ?? credentials.apiBaseUrl;
		const endpoint = `${apiBase}/rpc`;
		const result = await uploadSession(request, {
			endpoint,
			token: credentials.token,
			authType: credentials.authType,
			onRetry: (attempt, maxAttempts, error) => {
				logger.warn(
					"Retrying upload for {sessionId} ({attempt}/{maxAttempts}): {error}",
					{ sessionId: input.session_id, attempt, maxAttempts, error },
				);
			},
			analytics: {
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				projectPath: input.cwd,
				organizationId,
				userId: getCliUserId(credentials),
				credentials,
			},
		});

		if (result.success) {
			logger.info(
				"Upload successful for session {sessionId} (attempts: {attempts})",
				{ sessionId: input.session_id, attempts: result.attempts },
			);
			await removeFailedUpload(input.session_id);
		} else {
			logger.error("Upload failed for session {sessionId}: {error}", {
				sessionId: input.session_id,
				error: result.error,
			});
			await recordFailedUpload({
				sessionId: input.session_id,
				transcriptPath: input.transcript_path,
				projectPath: input.cwd,
				source: claudeCodeAdapter.source,
				organizationId,
				error: result.error ?? "Unknown error",
			});
		}
	} catch (error) {
		logger.error("Session end hook failed: {error}", { error });
	} finally {
		await disposeLogging();
	}
}

export const sessionEndCommand = buildCommand({
	loader: async () => ({ default: runSessionEnd }),
	parameters: {},
	docs: {
		brief: "Handle Claude Code SessionEnd hook",
	},
});
