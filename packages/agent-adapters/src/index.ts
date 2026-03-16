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
	getV3SessionsDir,
	isPiSession,
	isPiSessionDir,
	piAdapter,
	readPiSubagentFiles,
	transformV3Content,
} from "./adapters/pi/index.js";
export {
	getAdapter,
	getAllAdapters,
	getAvailableAdapters,
	registerAdapter,
	registerScanOnlyAdapter,
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
import { registerAdapter, registerScanOnlyAdapter } from "./registry.js";

registerAdapter(claudeCodeAdapter);
registerAdapter(codexAdapter);
registerScanOnlyAdapter(piAdapter);
