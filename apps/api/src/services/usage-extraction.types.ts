import type {
	UsageExtractionInput,
	UsageExtractionResult,
} from "@rudel/usage-events";
import type { SkillExtractionResult } from "./skill-extraction.types.js";

export interface UsageExtractionTelemetry {
	readonly contentBytes: number;
	readonly durationMs: number;
	readonly lineCount: number;
}

export interface UsageExtractionWorkerRequest {
	readonly extractSkills?: boolean;
	readonly input: UsageExtractionInput;
	readonly requestId: number;
	readonly skillSessionDate?: string;
}

export interface SessionFactsExtractionResult {
	readonly skills: SkillExtractionResult | null;
	readonly usage: UsageExtractionResult;
}

export type UsageExtractionWorkerResponse =
	| {
			readonly requestId: number;
			readonly result: UsageExtractionResult;
			readonly skills: SkillExtractionResult | null;
			readonly status: "success";
			readonly telemetry: UsageExtractionTelemetry;
	  }
	| {
			readonly message: string;
			readonly requestId: number;
			readonly status: "error";
	  };
