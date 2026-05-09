import type {
	MachineScanResult,
	ScanRootSuggestionsResult,
} from "@rudel/skill-schema";

export type ScanMachineInput = {
	roots: string[];
	selection: ScanSelection;
};

export type ScanSelection = {
	profiles: ScanSelectionProfiles;
	includeGlobs: string[];
	excludedPaths: string[];
};

export type ScanSelectionProfiles = {
	agentSkills: boolean;
	cursorRules: boolean;
	repoContext: boolean;
	globalAgentRoots: boolean;
};

export type LocalEngine = {
	suggestScanRoots(): Promise<ScanRootSuggestionsResult>;
	scanMachine(input: ScanMachineInput): Promise<MachineScanResult>;
};
