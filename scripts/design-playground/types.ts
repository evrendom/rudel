export type PlaygroundProfile = "fixture" | "local-real";

export type StubBehavior =
	| "auth"
	| "ok"
	| "uploaded-mixed"
	| "proxy-html"
	| "rate-limit"
	| "retry-choreo"
	| "server-error"
	| "staggered"
	| "too-large";

export type FixtureVariant =
	| "empty"
	| "hooks-enabled"
	| "huge"
	| "retry-queue"
	| "signed-out"
	| "standard";

export type ScenarioGroup = "Errors" | "Happy paths" | "Scale" | "States";

export type AgentState = "claude-hook-enabled" | "clean" | "hooks-enabled";

export interface PlaygroundUser {
	readonly email: string;
	readonly id: string;
	readonly name: string;
}

export interface PlaygroundOrganization {
	readonly id: string;
	readonly name: string;
	readonly slug: string;
}

export interface PlaygroundIdentity {
	readonly organizations: readonly PlaygroundOrganization[];
	readonly user: PlaygroundUser;
}

export interface Scenario {
	readonly agentState: AgentState;
	readonly argv: readonly string[];
	readonly description: string;
	readonly env: Readonly<Record<string, string>>;
	readonly fixture: FixtureVariant;
	readonly group: ScenarioGroup;
	readonly label: string;
	readonly name: string;
	readonly profile: PlaygroundProfile;
	readonly stubBehavior: StubBehavior;
}

export interface StubLogEntry {
	readonly bytes: number;
	readonly method: string;
	readonly path: string;
	readonly scenario: StubBehavior;
	readonly status: number;
	readonly timestamp: string;
}

export type CliMode = "packed" | "source";
