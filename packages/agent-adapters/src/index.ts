export {
	claudeCodeAdapter,
	decodeProjectPath,
	extractAgentIds,
	readSubagentFiles,
} from "./adapters/claude-code/index";
export {
	codexAdapter,
	findActiveRolloutFile,
	readCodexSessionMeta,
} from "./adapters/codex/index";
export {
	getAdapter,
	getAllAdapters,
	getAvailableAdapters,
	registerAdapter,
} from "./registry";
export type {
	AgentAdapter,
	GitInfo,
	IngestContext,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "./types";
export {
	readFileWithRetry,
	toClickHouseDateTime,
	toDisplayPath,
	walkJsonlFiles,
} from "./utils";

// Auto-register adapters
import { claudeCodeAdapter } from "./adapters/claude-code/index";
import { codexAdapter } from "./adapters/codex/index";
import { registerAdapter } from "./registry";

registerAdapter(claudeCodeAdapter);
registerAdapter(codexAdapter);
