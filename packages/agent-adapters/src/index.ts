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
	getAdapter,
	getAllAdapters,
	getAvailableAdapters,
	registerAdapter,
} from "./registry.js";
export {
	applyRetentionPolicy,
	applySubagentRetentionPolicy,
	retainContent,
} from "./retention.js";
export type {
	AgentAdapter,
	GitInfo,
	IngestContext,
	IngestRetentionMode,
	IngestRetentionPolicy,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "./types.js";
export {
	readFileWithRetry,
	toClickHouseDateTime,
	toDisplayPath,
	walkJsonlFiles,
} from "./utils.js";

// Auto-register adapters
import { claudeCodeAdapter } from "./adapters/claude-code/index.js";
import { codexAdapter } from "./adapters/codex/index.js";
import { registerAdapter } from "./registry.js";

registerAdapter(claudeCodeAdapter);
registerAdapter(codexAdapter);
