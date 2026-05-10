import type {
	MachineScanResult,
	ScanRootSuggestionsResult,
	SkillArtifact,
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

export type SkillInventoryStreamEvent =
	| {
			type: "skill";
			scanId: string;
			artifact: SkillArtifact;
	  }
	| {
			type: "done";
			scanId: string;
			result: MachineScanResult;
	  }
	| {
			type: "error";
			scanId: string;
			message: string;
	  };

export type LocalEngine = {
	suggestScanRoots(): Promise<ScanRootSuggestionsResult>;
	scanMachine(input: ScanMachineInput): Promise<MachineScanResult>;
	streamSkillInventory(
		input: ScanMachineInput,
		onEvent: (event: SkillInventoryStreamEvent) => void,
	): Promise<() => void>;
};
