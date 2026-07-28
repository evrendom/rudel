import type { IngestSessionInput } from "@rudel/api-routes";
import type { SessionTextFilterResult } from "@rudel/secret-filter";

type IngestSubagent = NonNullable<IngestSessionInput["subagents"]>[number];

export interface IngestFilterFields {
	readonly content: string;
	readonly subagents: IngestSessionInput["subagents"];
}

export type IngestFilterResult = SessionTextFilterResult<IngestSubagent>;

export interface IngestFilterWorkerRequest {
	readonly requestId: number;
	readonly fields: IngestFilterFields;
}

export type IngestFilterWorkerResponse =
	| {
			readonly status: "success";
			readonly requestId: number;
			readonly result: IngestFilterResult;
	  }
	| {
			readonly status: "error";
			readonly requestId: number;
			readonly message: string;
	  };
