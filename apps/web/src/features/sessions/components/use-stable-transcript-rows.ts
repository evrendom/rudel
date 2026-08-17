import { useRef } from "react";
import {
	type SessionTranscriptRow,
	stabilizeTranscriptRows,
} from "./session-transcript-sections";

export function useStableTranscriptRows(rows: readonly SessionTranscriptRow[]) {
	const previousRowsRef = useRef<readonly SessionTranscriptRow[]>([]);
	const stableRows = stabilizeTranscriptRows(previousRowsRef.current, rows);
	previousRowsRef.current = stableRows;
	return stableRows;
}
