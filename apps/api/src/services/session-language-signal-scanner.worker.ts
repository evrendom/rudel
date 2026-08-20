import type {
	SessionLanguageSignalScannerWorkerRequest,
	SessionLanguageSignalScannerWorkerResponse,
} from "./session-language-signal-scanner.types.js";
import { summarizeSessionLanguageSignals } from "./session-language-signal-summary.js";

declare const self: {
	addEventListener(
		type: "message",
		listener: (
			event: MessageEvent<SessionLanguageSignalScannerWorkerRequest>,
		) => void,
	): void;
	postMessage(message: SessionLanguageSignalScannerWorkerResponse): void;
};

self.addEventListener(
	"message",
	(event: MessageEvent<SessionLanguageSignalScannerWorkerRequest>) => {
		try {
			self.postMessage({
				counts: summarizeSessionLanguageSignals(event.data.content),
				requestId: event.data.requestId,
				status: "success",
			});
		} catch (error) {
			self.postMessage({
				message:
					error instanceof Error
						? error.message
						: "Language-signal scan failed",
				requestId: event.data.requestId,
				status: "error",
			});
		}
	},
);
