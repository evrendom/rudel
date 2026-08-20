import type { LanguageSignalCounts } from "@rudel/language-signals";

export interface SessionLanguageSignalScannerWorkerRequest {
	readonly content: string;
	readonly requestId: number;
}

export type SessionLanguageSignalScannerWorkerResponse =
	| {
			readonly counts: LanguageSignalCounts;
			readonly requestId: number;
			readonly status: "success";
	  }
	| {
			readonly message: string;
			readonly requestId: number;
			readonly status: "error";
	  };
