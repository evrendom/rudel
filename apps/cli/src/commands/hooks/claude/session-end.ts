import { getLogger } from "@logtape/logtape";
import { claudeCodeAdapter, type SessionFile } from "@rudel/agent-adapters";
import { buildCommand } from "@stricli/core";
import { loadCredentials } from "../../../lib/credentials";
import {
	recordFailedUpload,
	removeFailedUpload,
} from "../../../lib/failed-uploads";
import { getGitInfo } from "../../../lib/git-info";
import { getProjectOrgId } from "../../../lib/project-config";
import { uploadSession } from "../../../lib/uploader";
import { disposeLogging, setupHookLogging } from "../../../logging";

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
		if (!raw.trim()) return;

		const input = JSON.parse(raw) as HookInput;
		if (!input.session_id || !input.transcript_path) return;

		const credentials = loadCredentials();
		if (!credentials) return;

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

		const request = await claudeCodeAdapter.buildUploadRequest(sessionFile, {
			gitInfo,
			organizationId,
		});

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
