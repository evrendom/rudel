import { createReadStream } from "node:fs";
import { MAX_STREAM_RECORD_BYTES } from "../../lib/filtered-upload-staging.js";

const MAX_SCAN_ATTEMPTS = 5;
const SCAN_RETRY_DELAY_MS = 500;
const NEWLINE_BYTE = 0x0a;

export async function scanBoundedJsonlFile<State>(
	path: string,
	createState: () => State,
	onRecord: (record: string, state: State) => boolean,
): Promise<State> {
	for (let attempt = 1; attempt <= MAX_SCAN_ATTEMPTS; attempt++) {
		const state = createState();
		try {
			await scanOnce(path, (record) => onRecord(record, state));
			return state;
		} catch (error) {
			if (error instanceof RecordVisitorError) throw error.cause;
			if (attempt === MAX_SCAN_ATTEMPTS) throw error;
			await new Promise((resolve) => setTimeout(resolve, SCAN_RETRY_DELAY_MS));
		}
	}
	throw new Error(`Failed to scan JSONL file: ${path}`);
}

async function scanOnce(
	path: string,
	onRecord: (record: string) => boolean,
): Promise<void> {
	const input = createReadStream(path, { highWaterMark: 64 * 1024 });
	let chunks: Buffer[] = [];
	let recordBytes = 0;
	let oversized = false;

	try {
		for await (const rawChunk of input) {
			const chunk = Buffer.from(rawChunk);
			let offset = 0;
			while (offset < chunk.byteLength) {
				const newlineIndex = chunk.indexOf(NEWLINE_BYTE, offset);
				const end = newlineIndex < 0 ? chunk.byteLength : newlineIndex;
				const segment = chunk.subarray(offset, end);
				recordBytes += segment.byteLength;
				if (!oversized) {
					if (recordBytes > MAX_STREAM_RECORD_BYTES) {
						oversized = true;
						chunks = [];
					} else if (segment.byteLength > 0) {
						chunks.push(segment);
					}
				}

				if (newlineIndex < 0) break;
				recordBytes += 1;
				if (
					!oversized &&
					recordBytes <= MAX_STREAM_RECORD_BYTES &&
					!visitRecord(chunks, recordBytes - 1, onRecord)
				) {
					return;
				}
				chunks = [];
				recordBytes = 0;
				oversized = false;
				offset = newlineIndex + 1;
			}
		}

		if (
			!oversized &&
			recordBytes > 0 &&
			recordBytes <= MAX_STREAM_RECORD_BYTES
		) {
			visitRecord(chunks, recordBytes, onRecord);
		}
	} finally {
		input.destroy();
	}
}

function visitRecord(
	chunks: Buffer[],
	byteLength: number,
	onRecord: (record: string) => boolean,
): boolean {
	try {
		return onRecord(Buffer.concat(chunks, byteLength).toString("utf8"));
	} catch (cause) {
		throw new RecordVisitorError(cause);
	}
}

class RecordVisitorError extends Error {
	constructor(readonly cause: unknown) {
		super("JSONL record visitor failed");
	}
}
