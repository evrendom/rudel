import type { IngestSessionInput, Source } from "@rudel/api-routes";
import type { Ingestor } from "@rudel/ch-schema/generated";

export interface SessionFile {
	sessionId: string;
	transcriptPath: string;
	projectPath: string;
	gitBranch?: string;
	gitSha?: string;
}

export interface ScannedProject {
	source: Source;
	projectPath: string;
	displayPath: string;
	sessions: SessionFile[];
	sessionCount: number;
}

export interface GitInfo {
	gitRemote?: string;
	packageName?: string;
	packageType?: string;
	branch?: string;
	sha?: string;
}

export interface UploadContext {
	tag?: IngestSessionInput["tag"];
	organizationId?: string;
	gitInfo: GitInfo;
	uploadMode: IngestSessionInput["upload_mode"];
}

export interface IngestContext {
	userId: string;
	organizationId: string;
}

export interface AgentAdapter {
	name: string;
	source: Source;
	rawTableName: string;

	// Session Discovery (CLI)
	getSessionsBaseDir(): string;
	findProjectSessions(projectPath: string): Promise<SessionFile[]>;
	scanAllSessions(): Promise<ScannedProject[]>;

	// Hook Management (CLI)
	getHookConfigPath(): string;
	installHook(): void;
	removeHook(): void;
	isHookInstalled(): boolean;

	// Upload Request Building (CLI)
	buildUploadRequest(
		session: SessionFile,
		context: UploadContext,
	): Promise<IngestSessionInput>;

	// Ingestion (API)
	extractTimestamps(content: string): {
		sessionDate: string;
		lastInteractionDate: string;
	} | null;
	ingest(
		ingestor: Ingestor,
		input: IngestSessionInput,
		context: IngestContext,
	): Promise<void>;
}
