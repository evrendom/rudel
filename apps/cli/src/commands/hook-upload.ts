import { getLogger } from "@logtape/logtape";
import { claudeCodeAdapter, type SessionFile } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import { buildCommand } from "@stricli/core";
import { classifySession } from "../lib/classifier.js";
import { readConfig } from "../lib/config.js";
import { getGitInfo } from "../lib/git-info.js";
import {
	captureCliUploadFailed,
	captureCliUploadSkipped,
	getUploadPreparationFailureStage,
} from "../lib/product-analytics.js";
import { parseStdinInput, readStdin } from "../lib/stdin.js";
import { DEFAULT_ENDPOINT } from "../lib/types.js";
import { uploadSession } from "../lib/uploader.js";
import { disposeLogging, setupHookLogging } from "../logging.js";

async function runHookUpload(): Promise<void> {
	await setupHookLogging();
	const logger = getLogger(["rudel", "cli", "hook"]);

	try {
		logger.debug("Hook upload started");

		const config = await readConfig();

		if (!config.apiKey) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "not_authenticated",
				projectPath: process.cwd(),
			});
			logger.debug("Not logged in, skipping session upload.");
			return;
		}

		const stdinContent = await readStdin();
		const input = parseStdinInput(stdinContent);

		if (!input) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "missing_input",
				projectPath: process.cwd(),
			});
			logger.debug("No stdin input, exiting.");
			return;
		}

		const { session_id, transcript_path, cwd } = input;
		if (!session_id || !transcript_path) {
			captureCliUploadSkipped({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				skipReason: "missing_input",
				projectPath: cwd || process.cwd(),
			});
			logger.error("Missing session_id or transcript_path");
			return;
		}

		const sessionFile: SessionFile = {
			sessionId: session_id,
			transcriptPath: transcript_path,
			projectPath: cwd,
		};

		const gitInfo = await getGitInfo(cwd);

		let request: IngestSessionInput;
		try {
			request = await claudeCodeAdapter.buildUploadRequest(sessionFile, {
				gitInfo,
			});

			const tag = await classifySession(request.content);
			if (tag) {
				(request as { tag?: string }).tag = tag;
			}
		} catch (error) {
			captureCliUploadFailed({
				surface: "hook",
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				failureStage: getUploadPreparationFailureStage(error),
				error,
				projectPath: cwd,
			});
			logger.error(
				"Failed to prepare upload for session {sessionId}: {error}",
				{
					sessionId: session_id,
					error,
				},
			);
			return;
		}

		const endpoint =
			process.env.GAZED_INGEST_ENDPOINT ?? config.endpoint ?? DEFAULT_ENDPOINT;

		logger.info(
			"Uploading session {sessionId}, remote={gitRemote}, branch={branch}, tag={tag}, bytes={bytes}, subagents={subagents}",
			{
				sessionId: request.sessionId,
				gitRemote: request.gitRemote ?? "none",
				branch: request.gitBranch ?? "none",
				tag: request.tag ?? "none",
				bytes: request.content.length,
				subagents: request.subagents?.length ?? 0,
			},
		);

		const result = await uploadSession(request, {
			endpoint,
			token: config.apiKey,
			authType: "api-key",
			analytics: {
				clientSurface: "hook",
				uploadMode: "hook",
				agentSource: claudeCodeAdapter.source,
				projectPath: cwd,
			},
		});

		if (result.success) {
			logger.info("Upload successful for session {sessionId}", {
				sessionId: request.sessionId,
			});
		} else {
			logger.error("Upload failed: {error}", { error: result.error });
		}
	} catch (error) {
		logger.error("Unexpected error: {error}", { error });
	} finally {
		await disposeLogging();
	}
}

export const hookUploadCommand = buildCommand({
	loader: async () => ({ default: runHookUpload }),
	parameters: {},
	docs: {
		brief: "Upload session from Claude Code hook (reads stdin, logs to file)",
	},
});
