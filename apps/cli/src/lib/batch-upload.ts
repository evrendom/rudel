import type { Source } from "@rudel/api-routes";
import pMap from "p-map";
import { recordFailedUpload, removeFailedUpload } from "./failed-uploads.js";
import type { UploadResult } from "./types.js";

export interface BatchUploadItem {
	sessionId: string;
	label: string;
	transcriptPath: string;
	projectPath: string;
	source?: Source;
	organizationId?: string;
}

export interface BatchUploadOptions<T extends BatchUploadItem> {
	items: T[];
	upload: (
		item: T,
		onRetry: (attempt: number, maxAttempts: number, error: string) => void,
	) => Promise<UploadResult>;
	concurrency?: number;
	onItemComplete?: (completed: number, total: number) => void;
	onRetry?: (
		label: string,
		attempt: number,
		maxAttempts: number,
		error: string,
	) => void;
}

export interface BatchUploadSummary {
	succeeded: number;
	failed: number;
	total: number;
	errors: Array<{ label: string; error: string }>;
}

export async function batchUpload<T extends BatchUploadItem>(
	options: BatchUploadOptions<T>,
): Promise<BatchUploadSummary> {
	const { items, upload, concurrency = 5, onItemComplete, onRetry } = options;
	const total = items.length;
	let succeeded = 0;
	let failed = 0;
	let skipped = 0;
	let completed = 0;
	let rateLimited = false;
	const errors: Array<{ label: string; error: string }> = [];

	await pMap(
		items,
		async (item) => {
			if (rateLimited) {
				skipped++;
				const error =
					"Skipped — rate limit reached. Run `rudel upload --retry` to upload remaining sessions.";
				await recordFailedUpload({
					sessionId: item.sessionId,
					transcriptPath: item.transcriptPath,
					projectPath: item.projectPath,
					source: item.source,
					organizationId: item.organizationId,
					error,
				});
				completed++;
				onItemComplete?.(completed, total);
				return;
			}

			const itemOnRetry = (
				attempt: number,
				maxAttempts: number,
				error: string,
			) => {
				onRetry?.(item.label, attempt, maxAttempts, error);
			};

			try {
				const result = await upload(item, itemOnRetry);
				if (result.success) {
					succeeded++;
					await removeFailedUpload(item.sessionId);
				} else {
					failed++;
					const error = result.error ?? "Unknown error";
					errors.push({ label: item.label, error });
					if (result.rateLimited) {
						rateLimited = true;
					}
					await recordFailedUpload({
						sessionId: item.sessionId,
						transcriptPath: item.transcriptPath,
						projectPath: item.projectPath,
						source: item.source,
						organizationId: item.organizationId,
						error,
					});
				}
			} catch (err) {
				failed++;
				const error = err instanceof Error ? err.message : String(err);
				errors.push({ label: item.label, error });
				await recordFailedUpload({
					sessionId: item.sessionId,
					transcriptPath: item.transcriptPath,
					projectPath: item.projectPath,
					source: item.source,
					organizationId: item.organizationId,
					error,
				});
			} finally {
				completed++;
				onItemComplete?.(completed, total);
			}
		},
		{ concurrency, stopOnError: false },
	);

	if (rateLimited && skipped > 0) {
		errors.push({
			label: "Rate limit",
			error: `${skipped} session(s) skipped. Run \`rudel upload --retry\` later to upload them.`,
		});
		failed += skipped;
	}

	return { succeeded, failed, total, errors };
}
