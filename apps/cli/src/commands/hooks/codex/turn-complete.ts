import { getLogger } from "@logtape/logtape";
import {
	codexAdapter,
	findActiveRolloutFile,
	type SessionFile,
} from "@rudel/agent-adapters";
import { buildCommand } from "@stricli/core";
import { loadCredentials } from "../../../lib/credentials.js";
import {
	recordFailedUpload,
	removeFailedUpload,
} from "../../../lib/failed-uploads.js";
import { getGitInfo } from "../../../lib/git-info.js";
import { getProjectOrgId } from "../../../lib/project-config.js";
import { allowsInsecureEndpoint } from "../../../lib/upload-endpoint.js";
import { uploadSession } from "../../../lib/uploader.js";
import { disposeLogging, setupHookLogging } from "../../../logging.js";

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

async function runTurnComplete(): Promise<undefined | Error> {
	await setupHookLogging();
	const logger = getLogger(["rudel", "cli", "hook"]);

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

		const request = await codexAdapter.buildUploadRequest(sessionFile, {
			gitInfo,
			organizationId,
			uploadMode: "hook",
		});

		const apiBase = process.env.RUDEL_API_BASE ?? credentials.apiBaseUrl;
		const endpoint = `${apiBase}/rpc`;
		const result = await uploadSession(request, {
			endpoint,
			token: credentials.token,
			allowInsecureEndpoint: allowsInsecureEndpoint(false),
			authType: credentials.authType,
		});

		if (result.success) {
			await removeFailedUpload(input.thread_id);
		} else {
			const uploadError = result.error ?? "Unknown error";
			logger.error("Upload failed for session {sessionId}: {error}", {
				sessionId: input.thread_id,
				error: uploadError,
			});
			if (result.endpointRejected) {
				process.stderr.write(
					`Rudel hook upload refused for session ${input.thread_id}: ${uploadError}\n`,
				);
			}
			await recordFailedUpload({
				sessionId: input.thread_id,
				transcriptPath,
				projectPath: input.cwd,
				source: codexAdapter.source,
				organizationId,
				error: uploadError,
			});
			if (result.endpointRejected) {
				return new Error(uploadError);
			}
		}
	} catch (error) {
		logger.error("Codex turn-complete hook failed: {error}", { error });
	} finally {
		await disposeLogging();
	}
}

export const turnCompleteCommand = buildCommand({
	loader: async () => ({ default: runTurnComplete }),
	parameters: {},
	docs: {
		brief: "Handle Codex agent-turn-complete hook",
	},
});
