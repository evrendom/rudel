import type {
	MonthlyModelUsage,
	WrappedSourceSplit,
	WrappedV1,
} from "@rudel/api-routes";
import { ESTIMATED_PRICING_MODE } from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import { buildEstimatedCostSql } from "./pricing.service.js";

const VERIFIED_METRIC_COUNT = 8;

const PER_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "model_used",
	inputExpr: "ifNull(input_tokens, 0)",
	outputExpr: "ifNull(output_tokens, 0)",
	cacheReadInputExpr: "ifNull(cache_read_input_tokens, 0)",
	cacheCreationInputExpr: "ifNull(cache_creation_input_tokens, 0)",
});

interface WrappedSummaryRow {
	active_days: number | string | null;
	claude_session_count: number | string | null;
	codex_session_count: number | string | null;
	estimated_spend_usd: number | string | null;
	first_session_at: string | null;
	last_session_at: string | null;
	longest_session_min: number | string | null;
	total_sessions: number | string | null;
	total_tokens: number | string | null;
}

interface FavoriteModelRow {
	favorite_model: string;
}

interface MonthlyModelUsageRow {
	month: string;
	model: string;
	session_count: number | string | null;
}

export async function getWrappedV1Data(
	orgId: string,
	userId: string,
): Promise<WrappedV1> {
	const [summaryRow, favoriteModel, modelByMonth] = await Promise.all([
		getWrappedSummary(orgId, userId),
		getFavoriteModel(orgId, userId),
		getMonthlyModelUsage(orgId, userId),
	]);

	const totalSessions = toNumber(summaryRow.total_sessions);
	const claudeSessionCount = toNumber(summaryRow.claude_session_count);
	const codexSessionCount = toNumber(summaryRow.codex_session_count);
	const firstSessionAt = summaryRow.first_session_at;

	return {
		generated_at: new Date().toISOString(),
		organization_id: orgId,
		pricing_mode: ESTIMATED_PRICING_MODE,
		scope: "active_organization_all_time",
		user_id: userId,
		verified_metric_count: VERIFIED_METRIC_COUNT,
		metrics: {
			first_session_at: firstSessionAt,
			last_session_at: summaryRow.last_session_at,
			days_since_first_session: getDaysSinceTimestamp(firstSessionAt),
			total_sessions: totalSessions,
			active_days: toNumber(summaryRow.active_days),
			favorite_model: favoriteModel,
			total_tokens: toNumber(summaryRow.total_tokens),
			estimated_spend_usd: roundCurrency(summaryRow.estimated_spend_usd),
			longest_session_min: toNumber(summaryRow.longest_session_min),
			source_split: [
				buildSourceSplit("claude_code", claudeSessionCount, totalSessions),
				buildSourceSplit("codex", codexSessionCount, totalSessions),
			],
			model_by_month: modelByMonth,
		},
	};
}

async function getWrappedSummary(
	orgId: string,
	userId: string,
): Promise<WrappedSummaryRow> {
	const rows = await queryClickhouse<WrappedSummaryRow>({
		query: `
			SELECT
				count() AS total_sessions,
				uniqExact(toDate(session_date)) AS active_days,
				if(
					count() = 0,
					NULL,
					formatDateTime(min(session_date), '%Y-%m-%dT%H:%i:%SZ')
				) AS first_session_at,
				if(
					count() = 0,
					NULL,
					formatDateTime(max(session_date), '%Y-%m-%dT%H:%i:%SZ')
				) AS last_session_at,
				ifNull(sum(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)), 0) AS total_tokens,
				round(ifNull(sum(${PER_SESSION_COST_SQL}), 0), 4) AS estimated_spend_usd,
				ifNull(maxOrNull(actual_duration_min), 0) AS longest_session_min,
				countIf(source = 'claude_code') AS claude_session_count,
				countIf(source = 'codex') AS codex_session_count
			FROM rudel.session_analytics
			WHERE organization_id = {orgId:String}
				AND user_id = {userId:String}
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows[0] ?? getEmptyWrappedSummaryRow();
}

async function getMonthlyModelUsage(
	orgId: string,
	userId: string,
): Promise<MonthlyModelUsage[]> {
	const rows = await queryClickhouse<MonthlyModelUsageRow>({
		query: `
			SELECT
				formatDateTime(toStartOfMonth(session_date), '%Y-%m') AS month,
				model_used AS model,
				count() AS session_count
			FROM rudel.session_analytics
			WHERE organization_id = {orgId:String}
				AND user_id = {userId:String}
				AND model_used != ''
				AND model_used != 'unknown'
			GROUP BY month, model
			ORDER BY month ASC, session_count DESC, model ASC
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows.map((row) => ({
		month: row.month,
		model: row.model,
		session_count: toNumber(row.session_count),
	}));
}

async function getFavoriteModel(
	orgId: string,
	userId: string,
): Promise<string | null> {
	const rows = await queryClickhouse<FavoriteModelRow>({
		query: `
			SELECT favorite_model
			FROM (
				SELECT
					model_used AS favorite_model,
					count() AS session_count,
					sum(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) AS total_tokens
				FROM rudel.session_analytics
				WHERE organization_id = {orgId:String}
					AND user_id = {userId:String}
					AND model_used != ''
					AND model_used != 'unknown'
				GROUP BY favorite_model
				ORDER BY session_count DESC, total_tokens DESC, favorite_model ASC
			)
			LIMIT 1
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows[0]?.favorite_model ?? null;
}

function buildSourceSplit(
	source: WrappedSourceSplit["source"],
	sessionCount: number,
	totalSessions: number,
): WrappedSourceSplit {
	return {
		source,
		session_count: sessionCount,
		session_share_percent:
			totalSessions > 0
				? roundPercent((sessionCount / totalSessions) * 100)
				: 0,
	};
}

function getEmptyWrappedSummaryRow(): WrappedSummaryRow {
	return {
		active_days: 0,
		claude_session_count: 0,
		codex_session_count: 0,
		estimated_spend_usd: 0,
		first_session_at: null,
		last_session_at: null,
		longest_session_min: 0,
		total_sessions: 0,
		total_tokens: 0,
	};
}

function getDaysSinceTimestamp(timestamp: string | null): number {
	if (!timestamp) {
		return 0;
	}

	const firstSessionDate = new Date(timestamp);
	if (Number.isNaN(firstSessionDate.getTime())) {
		return 0;
	}

	const diffMs = Date.now() - firstSessionDate.getTime();
	return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function roundCurrency(value: number | string | null): number {
	return roundTo(toNumber(value), 4);
}

function roundPercent(value: number): number {
	return roundTo(value, 2);
}

function roundTo(value: number, precision: number): number {
	const factor = 10 ** precision;
	return Math.round(value * factor) / factor;
}

function toNumber(value: number | string | null): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}

	if (typeof value === "string" && value.trim().length > 0) {
		const parsedValue = Number(value);
		return Number.isFinite(parsedValue) ? parsedValue : 0;
	}

	return 0;
}
