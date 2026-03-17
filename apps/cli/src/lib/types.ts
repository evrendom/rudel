export type SessionTag =
	| "research"
	| "new_feature"
	| "bug_fix"
	| "refactoring"
	| "documentation"
	| "tests"
	| "other";

export const SESSION_TAGS: readonly SessionTag[] = [
	"research",
	"new_feature",
	"bug_fix",
	"refactoring",
	"documentation",
	"tests",
	"other",
] as const;

export interface UploadResult {
	success: boolean;
	status?: number;
	error?: string;
	attempts?: number;
	rateLimited?: boolean;
}

export const DEFAULT_ENDPOINT = "https://app.rudel.ai/rpc";
