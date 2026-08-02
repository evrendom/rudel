import {
	MODEL_RATE_CARD,
	MODEL_RATE_CARD_VERSION,
	type ModelContextBand,
	type ModelRateCardEntry,
} from "./model-rate-card.js";

export const ESTIMATED_PRICING_MODE = "estimated_model_pricing_v2" as const;

export type ResolveModelPricingOptions = {
	at: Date | string;
	contextBand?: ModelContextBand;
};

export type CalculateEstimatedCostInput = ResolveModelPricingOptions & {
	model?: string | null;
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	cacheCreation1hInputTokens?: number;
	precision?: number;
};

function normalizeModelId(model: string | null | undefined) {
	return model?.trim().toLowerCase() ?? "";
}

function normalizeDate(at: Date | string) {
	if (at instanceof Date) {
		return Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 10);
	}

	if (typeof at === "string") {
		const parsed = new Date(at);
		return Number.isNaN(parsed.getTime())
			? null
			: parsed.toISOString().slice(0, 10);
	}

	return null;
}

function isEffectiveOn(entry: ModelRateCardEntry, date: string) {
	return (
		entry.effectiveFrom <= date &&
		(entry.effectiveTo === undefined || date <= entry.effectiveTo)
	);
}

export function resolveModelPricing(
	model: string | null | undefined,
	options: ResolveModelPricingOptions,
): ModelRateCardEntry | null {
	const normalizedModel = normalizeModelId(model);
	const date = normalizeDate(options.at);
	const contextBand = options.contextBand ?? "base";

	if (!normalizedModel || date === null) {
		return null;
	}

	for (const entry of MODEL_RATE_CARD) {
		if (
			entry.contextBand === contextBand &&
			isEffectiveOn(entry, date) &&
			entry.match.some((pattern) =>
				new RegExp(pattern, "u").test(normalizedModel),
			)
		) {
			return entry;
		}
	}

	return null;
}

export function getModelPricingCatalog() {
	return MODEL_RATE_CARD;
}

function calculateComponent(tokens: number, rate: number | null) {
	if (tokens === 0) {
		return 0;
	}

	return rate === null ? null : (tokens / 1_000_000) * rate;
}

export function calculateEstimatedCost({
	model,
	inputTokens,
	outputTokens,
	cacheReadInputTokens = 0,
	cacheCreationInputTokens = 0,
	cacheCreation1hInputTokens = 0,
	precision = 4,
	at,
	contextBand,
}: CalculateEstimatedCostInput): number | null {
	const pricing = resolveModelPricing(model, { at, contextBand });

	if (pricing === null) {
		return null;
	}

	const components = [
		calculateComponent(inputTokens, pricing.inputPerMTok),
		calculateComponent(outputTokens, pricing.outputPerMTok),
		calculateComponent(cacheReadInputTokens, pricing.cacheReadPerMTok),
		calculateComponent(cacheCreationInputTokens, pricing.cacheWrite5mPerMTok),
		calculateComponent(cacheCreation1hInputTokens, pricing.cacheWrite1hPerMTok),
	];

	if (components.some((component) => component === null)) {
		return null;
	}

	const cost = components.reduce<number>(
		(sum, component) => sum + (component ?? 0),
		0,
	);
	return Number(cost.toFixed(precision));
}

function escapeSqlString(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

type RateSelector = keyof Pick<
	ModelRateCardEntry,
	| "inputPerMTok"
	| "cacheReadPerMTok"
	| "cacheWrite5mPerMTok"
	| "cacheWrite1hPerMTok"
	| "outputPerMTok"
>;

function buildRateSql({
	modelExpr,
	dateExpr,
	contextBand,
	rateSelector,
}: {
	modelExpr: string;
	dateExpr: string;
	contextBand: ModelContextBand;
	rateSelector: RateSelector;
}) {
	const clauses = MODEL_RATE_CARD.filter(
		(entry) => entry.contextBand === contextBand,
	).flatMap((entry) => {
		const dateConditions = [
			`toDate(${dateExpr}) >= toDate('${entry.effectiveFrom}')`,
		];

		if (entry.effectiveTo !== undefined) {
			dateConditions.push(
				`toDate(${dateExpr}) <= toDate('${entry.effectiveTo}')`,
			);
		}

		return entry.match.flatMap((pattern) => [
			`match(lowerUTF8(${modelExpr}), '${escapeSqlString(pattern)}') AND ${dateConditions.join(" AND ")}`,
			entry[rateSelector] === null
				? "CAST(NULL, 'Nullable(Float64)')"
				: `toNullable(toFloat64(${entry[rateSelector]}))`,
		]);
	});

	return `multiIf(${clauses.join(", ")}, CAST(NULL, 'Nullable(Float64)'))`;
}

function buildCostComponentSql(tokensExpr: string, rateSql: string) {
	return `if((${tokensExpr}) = 0, toNullable(0.0), ((${tokensExpr}) / 1000000.0) * (${rateSql}))`;
}

export function buildEstimatedCostSql({
	modelExpr,
	dateExpr,
	inputExpr,
	outputExpr,
	cacheReadInputExpr = "0",
	cacheCreationInputExpr = "0",
	cacheCreation1hInputExpr = "0",
	contextBand = "base",
	precision,
}: {
	modelExpr: string;
	dateExpr: string;
	inputExpr: string;
	outputExpr: string;
	cacheReadInputExpr?: string;
	cacheCreationInputExpr?: string;
	cacheCreation1hInputExpr?: string;
	contextBand?: ModelContextBand;
	precision?: number;
}) {
	const inputRateSql = buildRateSql({
		modelExpr,
		dateExpr,
		contextBand,
		rateSelector: "inputPerMTok",
	});
	const outputRateSql = buildRateSql({
		modelExpr,
		dateExpr,
		contextBand,
		rateSelector: "outputPerMTok",
	});
	const cachedInputRateSql = buildRateSql({
		modelExpr,
		dateExpr,
		contextBand,
		rateSelector: "cacheReadPerMTok",
	});
	const cacheWriteRateSql = buildRateSql({
		modelExpr,
		dateExpr,
		contextBand,
		rateSelector: "cacheWrite5mPerMTok",
	});
	const cacheWrite1hRateSql = buildRateSql({
		modelExpr,
		dateExpr,
		contextBand,
		rateSelector: "cacheWrite1hPerMTok",
	});
	const components = [
		buildCostComponentSql(inputExpr, inputRateSql),
		buildCostComponentSql(outputExpr, outputRateSql),
		buildCostComponentSql(cacheReadInputExpr, cachedInputRateSql),
		buildCostComponentSql(cacheCreationInputExpr, cacheWriteRateSql),
		buildCostComponentSql(cacheCreation1hInputExpr, cacheWrite1hRateSql),
	];
	const expression = `(${components.join(" + ")})`;

	return typeof precision === "number"
		? `round(${expression}, ${precision})`
		: expression;
}

/**
 * Build the canonical ClickHouse estimate for one session_analytics row.
 *
 * `session_analytics.input_tokens` is cache-inclusive, while the rate card's
 * input rate applies only to uncached input. Keeping that translation beside
 * the rate-card implementation prevents each API surface from recreating it.
 */
export function buildSessionEstimatedCostSql(tableAlias = "") {
	if (tableAlias !== "" && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tableAlias)) {
		throw new Error("Invalid session analytics table alias");
	}

	const column = (name: string) =>
		tableAlias === "" ? name : `${tableAlias}.${name}`;
	const inputTokens = `ifNull(${column("input_tokens")}, 0)`;
	const cacheReadInputTokens = `ifNull(${column("cache_read_input_tokens")}, 0)`;
	const cacheCreationInputTokens = `ifNull(${column("cache_creation_input_tokens")}, 0)`;
	const cacheCreation5mInputTokens = `ifNull(${column("cache_creation_5m_input_tokens")}, 0)`;
	const cacheCreation1hInputTokens = `ifNull(${column("cache_creation_1h_input_tokens")}, 0)`;

	return buildEstimatedCostSql({
		modelExpr: column("model_used"),
		dateExpr: column("session_date"),
		inputExpr: `greatest(${inputTokens} - ${cacheReadInputTokens} - ${cacheCreationInputTokens}, 0)`,
		outputExpr: `ifNull(${column("output_tokens")}, 0)`,
		cacheReadInputExpr: cacheReadInputTokens,
		cacheCreationInputExpr: cacheCreation5mInputTokens,
		cacheCreation1hInputExpr: cacheCreation1hInputTokens,
	});
}

function formatPrice(rate: number | null) {
	return rate === null ? "—" : `$${rate}`;
}

function formatPeriod(entry: ModelRateCardEntry) {
	return entry.effectiveTo === undefined
		? `${entry.effectiveFrom} → current`
		: `${entry.effectiveFrom} → ${entry.effectiveTo}`;
}

function formatRateCardRow(entry: ModelRateCardEntry) {
	const modelLabel =
		entry.contextBand === "long"
			? `${entry.displayName} (long)`
			: entry.displayName;
	const cacheWrite = `${formatPrice(entry.cacheWrite5mPerMTok)} / ${formatPrice(entry.cacheWrite1hPerMTok)}`;

	return `| [${modelLabel}](${entry.source}) | ${formatPeriod(entry)} | ${formatPrice(entry.inputPerMTok)} | ${formatPrice(entry.cacheReadPerMTok)} | ${cacheWrite} | ${formatPrice(entry.outputPerMTok)} | ${entry.verifiedAt} | ${entry.notes} |`;
}

export function renderModelPricingTable() {
	const sections = ["openai", "anthropic"].map((provider) => {
		const title = provider === "openai" ? "OpenAI" : "Anthropic";
		const rows = MODEL_RATE_CARD.filter(
			(entry) => entry.provider === provider,
		).map(formatRateCardRow);

		return [
			`## ${title}`,
			"",
			"| Model | Effective period | Input / MTok | Cache read / MTok | Cache write 5m / 1h | Output / MTok | Verified | Notes |",
			"| --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
			...rows,
		].join("\n");
	});

	return [
		"# Model pricing",
		"",
		"<!-- Generated by `bun run pricing:table`. Do not edit by hand. -->",
		"",
		`Rate card version: ${MODEL_RATE_CARD_VERSION}. Standard first-party API rates in USD per million tokens.`,
		"Cache-write columns show 5-minute / 1-hour rates; an em dash means the provider does not publish that tier.",
		"OpenAI publishes a duration-agnostic cache-write rate, shown in the 5-minute column for a consistent schema.",
		"",
		"Known estimation limits: session aggregates assign all tokens to one resolved model; callers use the base context band unless request-level context is available; cache writes use the 5-minute tier unless 1-hour token counts are supplied; unresolved models return no estimate. Effective dates use the stored session date; its UTC-versus-user-local boundary can move sessions near a rate cutoff by one day until per-request timestamps are available.",
		"",
		sections.join("\n\n"),
		"",
	].join("\n");
}
