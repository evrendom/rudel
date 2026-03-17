import {
	codexAdapter,
	findActiveRolloutFile,
	type SessionFile,
} from "@rudel/agent-adapters";
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
	getCliUserId,
	getUploadPreparationFailureStage,
	withCliUploadTelemetry,
} from "../../../lib/product-analytics.js";
import { getProjectOrgId } from "../../../lib/project-config.js";
import { uploadSession } from "../../../lib/uploader.js";

interface CodexNotifyInput {
	type: string;
	thread_id: string;
	turn_id?: string;
	cwd: string;
	transcript_path?: string;
}

async function readStdin(): Promise<string> {
	const chunks: string[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
	}
	return chunks.join("");
}

async function runTurnComplete(): Promise<void> {
	try {
		const raw = await readStdin();
		if (!raw.trim()) return;

		const input = JSON.parse(raw) as CodexNotifyInput;
		if (!input.thread_id || !input.cwd) return;

		const credentials = loadCredentials();
		if (!credentials) return;

		const transcriptPath =
			input.transcript_path ?? (await findActiveRolloutFile(input.thread_id));
		if (!transcriptPath) return;

		const sessionFile: SessionFile = {
			sessionId: input.thread_id,
			transcriptPath,
			projectPath: input.cwd,
		};

		const gitInfo = await getGitInfo(input.cwd);
		const organizationId = await getProjectOrgId(input.cwd);

		let request: IngestSessionInput;
		try {
			request = await codexAdapter.buildUploadRequest(sessionFile, {
				gitInfo,
				organizationId,
			});
		} catch (error) {
			captureCliUploadFailed({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: codexAdapter.source,
				failureStage: getUploadPreparationFailureStage(error),
				error,
				organizationId,
				userId: getCliUserId(credentials),
				projectPath: input.cwd,
			});
			return;
		}

		const apiBase = process.env.RUDEL_API_BASE ?? credentials.apiBaseUrl;
		const endpoint = `${apiBase}/rpc`;
		const result = await uploadSession(
			withCliUploadTelemetry(request, {
				clientSurface: "hook",
				uploadMode: "hook",
			}),
			{
				endpoint,
				token: credentials.token,
				authType: credentials.authType,
				analytics: {
					clientSurface: "hook",
					uploadMode: "hook",
					agentSource: codexAdapter.source,
					projectPath: input.cwd,
					organizationId,
					userId: getCliUserId(credentials),
					credentials,
				},
			},
		);

		if (result.success) {
			await removeFailedUpload(input.thread_id);
		} else {
			await recordFailedUpload({
				sessionId: input.thread_id,
				transcriptPath,
				projectPath: input.cwd,
				source: codexAdapter.source,
				organizationId,
				error: result.error ?? "Unknown error",
			});
		}
	} catch {
		// Swallow all errors — this runs async in the background
	}
}

export const turnCompleteCommand = buildCommand({
	loader: async () => ({ default: runTurnComplete }),
	parameters: {},
	docs: {
		brief: "Handle Codex agent-turn-complete hook",
	},
});
