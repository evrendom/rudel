import type { LanguageSignalCounts } from "@rudel/language-signals";
import {
	reconcileSessionLanguageSignalsOnce,
	type StaleSessionLanguageSignalRow,
} from "../../services/session-language-signal-reconciliation.service.js";

const sourceRevision = "2026-08-19T12:00:01.123Z";
const staleRow: StaleSessionLanguageSignalRow = {
	organization_id: "timezone-org",
	raw_ingested_at: sourceRevision,
	session_date: "2026-08-19T11:59:00.000Z",
	session_id: "timezone-session",
	source: "codex",
	user_id: "timezone-user",
};
const zeroCounts: LanguageSignalCounts = {
	member_apologies: 0,
	member_positive: 0,
	member_swears: 0,
	model_apologies: 0,
	model_positive: 0,
	model_swears: 0,
};
let persistedRawIngestedAt: string | undefined;

const result = await reconcileSessionLanguageSignalsOnce(1, {
	insertRows: async (rows) => {
		persistedRawIngestedAt = rows[0]?.raw_ingested_at;
	},
	now: () => new Date("2026-08-19T12:01:00.000Z"),
	queryLagCount: async () => 0,
	queryLatestRawContent: async () => ({
		content: "plain prompt",
		revision: sourceRevision,
	}),
	queryStaleRows: async () => [staleRow],
	scan: async () => zeroCounts,
});

if (result.rescanned !== 1 || !persistedRawIngestedAt) {
	throw new Error("Timezone fixture did not persist the reconciled row");
}

process.stdout.write(persistedRawIngestedAt);
