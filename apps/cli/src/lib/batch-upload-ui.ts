import { box, progress } from "@clack/prompts";
import {
	type BatchUploadItem,
	type BatchUploadOptions,
	type BatchUploadSummary,
	batchUpload,
} from "./batch-upload";

export interface BatchProgressOptions<T extends BatchUploadItem> {
	items: T[];
	upload: BatchUploadOptions<T>["upload"];
	label: string;
	concurrency?: number;
}

export async function runBatchUpload<T extends BatchUploadItem>(
	options: BatchProgressOptions<T>,
): Promise<BatchUploadSummary> {
	const { items, upload, label, concurrency } = options;

	const bar = progress({ max: items.length });
	bar.start(label);

	const summary = await batchUpload({
		items,
		upload,
		concurrency,
		onItemComplete: (completed, total) => {
			bar.advance(1, `[${completed}/${total}] ${label}`);
		},
		onRetry: (itemLabel, attempt, maxAttempts, error) => {
			bar.message(
				`Retrying ${itemLabel} (${attempt}/${maxAttempts}) after ${error}`,
			);
		},
	});

	bar.stop(
		summary.failed > 0
			? `Completed with ${summary.failed} error(s)`
			: "Upload complete",
	);

	return summary;
}

export interface SummaryDisplayOptions {
	context?: string;
	maxErrors?: number;
	showRetryHint?: boolean;
}

export function renderBatchSummary(
	summary: BatchUploadSummary,
	options?: SummaryDisplayOptions,
): void {
	const { context, maxErrors = 5, showRetryHint = false } = options ?? {};
	const prefix = context ? `${context}: ` : "";
	const lines: string[] = [];

	if (summary.succeeded > 0) {
		lines.push(`${prefix}${summary.succeeded} session(s) uploaded`);
	}
	if (summary.failed > 0) {
		lines.push(`${prefix}${summary.failed} session(s) failed`);
		for (const err of summary.errors.slice(0, maxErrors)) {
			lines.push(`  ${err.label}: ${err.error}`);
		}
		if (summary.errors.length > maxErrors) {
			lines.push(`  ...and ${summary.errors.length - maxErrors} more`);
		}
	}

	if (showRetryHint && summary.failed > 0) {
		lines.push("");
		lines.push("Run `rudel upload --retry` to retry failed uploads.");
	}

	if (lines.length > 0) {
		box(lines.join("\n"), "Upload Summary");
	}
}
