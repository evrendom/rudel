import type {
	UsageExtractionInput,
	UsageExtractionResult,
} from "@rudel/usage-events";

export interface UsageExtractionTelemetry {
	readonly contentBytes: number;
	readonly durationMs: number;
	readonly lineCount: number;
}

export interface UsageExtractionWorkerRequest {
	readonly input: UsageExtractionInput;
	readonly requestId: number;
}

export type UsageExtractionWorkerResponse =
	| {
			readonly requestId: number;
			readonly result: UsageExtractionResult;
			readonly status: "success";
			readonly telemetry: UsageExtractionTelemetry;
	  }
	| {
			readonly message: string;
			readonly requestId: number;
			readonly status: "error";
	  };
