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
}

export type IngestRetentionMode = "full" | "truncate" | "none";

export interface IngestRetentionPolicy {
	transcriptMode: IngestRetentionMode;
	transcriptMaxBytes: number;
	subagentMode: IngestRetentionMode;
	subagentMaxBytes: number;
}

export interface IngestContext {
	userId: string;
	organizationId: string;
	retentionPolicy?: IngestRetentionPolicy;
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
