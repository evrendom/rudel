export {
	claudeCodeAdapter,
	decodeProjectPath,
	extractAgentIds,
	readSubagentFiles,
} from "./adapters/claude-code/index.js";
export {
	codexAdapter,
	findActiveRolloutFile,
	readCodexSessionMeta,
} from "./adapters/codex/index.js";
export {
	extractV3SessionId,
	getV3SessionsDir,
	isPiSession,
	isPiSessionDir,
	piAdapter,
	readPiSubagentFiles,
} from "./adapters/pi/index.js";
export {
	getAdapter,
	getAllAdapters,
	getAvailableAdapters,
	registerAdapter,
} from "./registry.js";
export type {
	AgentAdapter,
	GitInfo,
	IngestContext,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "./types.js";
export {
	readFileWithRetry,
	readJsonlFirstLine,
	toClickHouseDateTime,
	toDisplayPath,
	walkJsonlFiles,
} from "./utils.js";

// Auto-register adapters
import { claudeCodeAdapter } from "./adapters/claude-code/index.js";
import { codexAdapter } from "./adapters/codex/index.js";
import { piAdapter } from "./adapters/pi/index.js";
import { registerAdapter } from "./registry.js";

registerAdapter(claudeCodeAdapter);
registerAdapter(codexAdapter);
registerAdapter(piAdapter);
