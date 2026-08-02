import { describe, expect, test } from "bun:test";
import {
	buildSessionEstimatedCostSql,
	calculateEstimatedCost,
	getModelPricingCatalog,
} from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";

interface UsageCase {
	cacheCreation1hInputTokens: number;
	cacheCreation5mInputTokens: number;
	cacheReadInputTokens: number;
	id: number;
	model: string;
	outputTokens: number;
	sessionDate: string;
	uncachedInputTokens: number;
}

interface SqlCostRow {
	id: number;
	estimated_cost: number | null;
}

const RANDOM_CASE_COUNT = 128;

describe("TypeScript and ClickHouse pricing parity", () => {
	test("matches across randomized token classes, models, and rate periods", async () => {
		const cases = buildUsageCases();
		const values = cases.map(toClickHouseValueTuple).join(",\n");
		const rows = await queryClickhouse<SqlCostRow>({
			query: `
				SELECT
					usage.id AS id,
					${buildSessionEstimatedCostSql("usage")} AS estimated_cost
				FROM VALUES(
					'id UInt32, model_used String, session_date DateTime64(3), input_tokens UInt64, output_tokens UInt64, cache_read_input_tokens UInt64, cache_creation_input_tokens UInt64, cache_creation_5m_input_tokens UInt64, cache_creation_1h_input_tokens UInt64',
					${values}
				) AS usage
				ORDER BY id
			`,
		});
		const rowById = new Map(rows.map((row) => [Number(row.id), row] as const));

		for (const usage of cases) {
			const expected = calculateEstimatedCost({
				at: usage.sessionDate,
				cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
				cacheCreationInputTokens: usage.cacheCreation5mInputTokens,
				cacheReadInputTokens: usage.cacheReadInputTokens,
				inputTokens: usage.uncachedInputTokens,
				model: usage.model,
				outputTokens: usage.outputTokens,
				precision: 8,
			});
			const actual = rowById.get(usage.id)?.estimated_cost ?? null;

			if (expected === null) {
				expect(actual, `case ${usage.id}`).toBeNull();
			} else {
				expect(Number(actual), `case ${usage.id}`).toBeCloseTo(expected, 7);
			}
		}
	});
});

function buildUsageCases(): UsageCase[] {
	const entries = getModelPricingCatalog().filter(
		(entry) => entry.contextBand === "base",
	);
	const random = createRandom(2_026_080_002);
	const cases = Array.from({ length: RANDOM_CASE_COUNT }, (_, id) => {
		const entry = entries[Math.floor(random() * entries.length)];
		if (!entry) throw new Error("The model pricing catalog is empty.");

		return {
			cacheCreation1hInputTokens: randomTokens(random),
			cacheCreation5mInputTokens: randomTokens(random),
			cacheReadInputTokens: randomTokens(random),
			id,
			model: entry.model,
			outputTokens: randomTokens(random),
			sessionDate: `${entry.effectiveFrom}T12:00:00.000Z`,
			uncachedInputTokens: randomTokens(random),
		};
	});

	return [
		...cases,
		{
			cacheCreation1hInputTokens: 0,
			cacheCreation5mInputTokens: 0,
			cacheReadInputTokens: 0,
			id: RANDOM_CASE_COUNT,
			model: "unresolved-future-model",
			outputTokens: 10,
			sessionDate: "2026-08-02T12:00:00.000Z",
			uncachedInputTokens: 10,
		},
	];
}

function toClickHouseValueTuple(usage: UsageCase) {
	const cacheCreationInputTokens =
		usage.cacheCreation5mInputTokens + usage.cacheCreation1hInputTokens;
	const inclusiveInputTokens =
		usage.uncachedInputTokens +
		usage.cacheReadInputTokens +
		cacheCreationInputTokens;

	return `(${usage.id}, '${escapeSqlString(usage.model)}', '${usage.sessionDate}', ${inclusiveInputTokens}, ${usage.outputTokens}, ${usage.cacheReadInputTokens}, ${cacheCreationInputTokens}, ${usage.cacheCreation5mInputTokens}, ${usage.cacheCreation1hInputTokens})`;
}

function escapeSqlString(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function randomTokens(random: () => number) {
	return Math.floor(random() * 2_000_000);
}

function createRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}
