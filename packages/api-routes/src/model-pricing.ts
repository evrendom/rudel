import {
	MODEL_LONG_CONTEXT_THRESHOLD_TOKENS,
	MODEL_RATE_CARD,
	MODEL_RATE_CARD_VERSION,
	MODEL_RATE_MODIFIERS,
	MODEL_UNPRICED_IDENTITIES,
	type ModelContextBand,
	type ModelPricingProvider,
	type ModelRateCardEntry,
	type ModelRateModifierDimension,
} from "./model-rate-card.js";

export { MODEL_RATE_CARD_VERSION };

export const ESTIMATED_PRICING_MODE = "estimated_model_pricing_v2" as const;

export type ResolveModelPricingOptions = {
	at: Date | string;
	contextBand?: ModelContextBand;
	contextInputTokens?: number;
	modelProvider?: string | null;
	serviceTier?: string | null;
	inferenceSpeed?: string | null;
	inferenceGeo?: string | null;
};

export type CanonicalModelIdentity = {
	provider: ModelPricingProvider;
	model: string;
	priceability: "published" | "unpriced";
	unpricedReason?: "no_public_rate" | "provider_mapping_required";
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

function findCanonicalModelIdentity(
	normalizedModel: string,
): CanonicalModelIdentity | null {
	for (const entry of MODEL_RATE_CARD) {
		if (
			entry.match.some((pattern) =>
				new RegExp(pattern, "u").test(normalizedModel),
			)
		) {
			return {
				provider: entry.provider,
				model: entry.model,
				priceability: "published",
			};
		}
	}
	for (const entry of MODEL_UNPRICED_IDENTITIES) {
		if (
			entry.match.some((pattern) =>
				new RegExp(pattern, "u").test(normalizedModel),
			)
		) {
			return {
				provider: entry.provider,
				model: entry.model,
				priceability: "unpriced",
				unpricedReason: entry.reason,
			};
		}
	}
	return null;
}

export function resolveCanonicalModelIdentity(
	model: string | null | undefined,
): CanonicalModelIdentity | null {
	const normalizedModel = normalizeModelId(model);
	if (normalizedModel === "") return null;
	const direct = findCanonicalModelIdentity(normalizedModel);
	if (direct) return direct;
	if (!normalizedModel.endsWith("[1m]")) return null;
	const withoutContextSuffix = normalizedModel.slice(0, -4).trimEnd();
	const suffixed = findCanonicalModelIdentity(withoutContextSuffix);
	return suffixed?.provider === "anthropic" ? suffixed : null;
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

function normalizePricingDimension(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? "";
}

function isBaseDimensionValue(
	provider: ModelPricingProvider,
	dimension: ModelRateModifierDimension,
	value: string,
) {
	if (dimension === "service_tier") {
		return provider === "anthropic"
			? ["", "auto", "default", "priority", "standard"].includes(value)
			: ["", "auto", "default", "standard"].includes(value);
	}
	if (dimension === "inference_speed") {
		return value === "" || value === "standard";
	}
	return value === "" || value === "global";
}

function resolveModifierMultiplier(
	entry: ModelRateCardEntry,
	date: string,
	options: ResolveModelPricingOptions,
): number | null {
	const modelProvider = normalizePricingDimension(options.modelProvider);
	if (modelProvider !== "" && modelProvider !== entry.provider) return null;

	let multiplier = 1;
	const dimensions: readonly [
		ModelRateModifierDimension,
		string | null | undefined,
	][] = [
		["service_tier", options.serviceTier],
		["inference_speed", options.inferenceSpeed],
		["inference_geo", options.inferenceGeo],
	];
	for (const [dimension, rawValue] of dimensions) {
		const value = normalizePricingDimension(rawValue);
		if (isBaseDimensionValue(entry.provider, dimension, value)) continue;
		const rule = MODEL_RATE_MODIFIERS.find(
			(candidate) =>
				candidate.provider === entry.provider &&
				candidate.model === entry.model &&
				candidate.dimension === dimension &&
				candidate.values.includes(value) &&
				candidate.effectiveFrom <= date &&
				(candidate.effectiveTo === undefined ||
					date <= candidate.effectiveTo) &&
				(candidate.contextBand === undefined ||
					candidate.contextBand === entry.contextBand),
		);
		if (!rule) return null;
		multiplier *= rule.multiplier;
	}
	return multiplier;
}

export function resolveModelPricing(
	model: string | null | undefined,
	options: ResolveModelPricingOptions,
): ModelRateCardEntry | null {
	const normalizedModel = normalizeModelId(model);
	const date = normalizeDate(options.at);
	const contextBand =
		options.contextBand ??
		(options.contextInputTokens !== undefined &&
		options.contextInputTokens > MODEL_LONG_CONTEXT_THRESHOLD_TOKENS
			? "long"
			: "base");

	if (!normalizedModel || date === null) {
		return null;
	}

	let matchedEntry: ModelRateCardEntry | null = null;
	for (const entry of MODEL_RATE_CARD) {
		if (
			entry.contextBand === contextBand &&
			isEffectiveOn(entry, date) &&
			entry.match.some((pattern) =>
				new RegExp(pattern, "u").test(normalizedModel),
			)
		) {
			matchedEntry = entry;
			break;
		}
	}

	if (
		matchedEntry === null &&
		options.contextBand === undefined &&
		contextBand === "long"
	) {
		return resolveModelPricing(model, { ...options, contextBand: "base" });
	}
	if (matchedEntry === null) return null;
	const multiplier = resolveModifierMultiplier(matchedEntry, date, options);
	if (multiplier === null) return null;
	if (multiplier === 1) return matchedEntry;

	return {
		...matchedEntry,
		inputPerMTok: matchedEntry.inputPerMTok * multiplier,
		cacheReadPerMTok:
			matchedEntry.cacheReadPerMTok === null
				? null
				: matchedEntry.cacheReadPerMTok * multiplier,
		cacheWrite5mPerMTok:
			matchedEntry.cacheWrite5mPerMTok === null
				? null
				: matchedEntry.cacheWrite5mPerMTok * multiplier,
		cacheWrite1hPerMTok:
			matchedEntry.cacheWrite1hPerMTok === null
				? null
				: matchedEntry.cacheWrite1hPerMTok * multiplier,
		outputPerMTok: matchedEntry.outputPerMTok * multiplier,
	};
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
	contextInputTokens,
	modelProvider,
	serviceTier,
	inferenceSpeed,
	inferenceGeo,
}: CalculateEstimatedCostInput): number | null {
	const pricing = resolveModelPricing(model, {
		at,
		contextBand,
		contextInputTokens,
		modelProvider,
		serviceTier,
		inferenceSpeed,
		inferenceGeo,
	});

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

function buildDimensionMultiplierSql({
	entry,
	dimension,
	valueExpr,
	dateExpr,
}: {
	entry: ModelRateCardEntry;
	dimension: ModelRateModifierDimension;
	valueExpr: string;
	dateExpr: string;
}) {
	const baseValues =
		dimension === "service_tier"
			? entry.provider === "anthropic"
				? ["", "auto", "default", "priority", "standard"]
				: ["", "auto", "default", "standard"]
			: dimension === "inference_speed"
				? ["", "standard"]
				: ["", "global"];
	const normalizedValue = `lowerUTF8(trimBoth(${valueExpr}))`;
	const clauses = [
		`${normalizedValue} IN (${baseValues.map((value) => `'${value}'`).join(", ")})`,
		"toNullable(1.0)",
	];
	for (const modifier of MODEL_RATE_MODIFIERS) {
		if (
			modifier.provider !== entry.provider ||
			modifier.model !== entry.model ||
			modifier.dimension !== dimension ||
			(modifier.contextBand !== undefined &&
				modifier.contextBand !== entry.contextBand)
		) {
			continue;
		}
		const dateConditions = [
			`toDate(${dateExpr}) >= toDate('${modifier.effectiveFrom}')`,
		];
		if (modifier.effectiveTo !== undefined) {
			dateConditions.push(
				`toDate(${dateExpr}) <= toDate('${modifier.effectiveTo}')`,
			);
		}
		clauses.push(
			`${normalizedValue} IN (${modifier.values.map((value) => `'${escapeSqlString(value)}'`).join(", ")}) AND ${dateConditions.join(" AND ")}`,
			`toNullable(toFloat64(${modifier.multiplier}))`,
		);
	}
	return `multiIf(${clauses.join(", ")}, CAST(NULL, 'Nullable(Float64)'))`;
}

function buildRateMultiplierSql({
	entry,
	dateExpr,
	modelProviderExpr,
	serviceTierExpr,
	inferenceSpeedExpr,
	inferenceGeoExpr,
}: {
	entry: ModelRateCardEntry;
	dateExpr: string;
	modelProviderExpr: string;
	serviceTierExpr: string;
	inferenceSpeedExpr: string;
	inferenceGeoExpr: string;
}) {
	const providerIsCompatible = `lowerUTF8(trimBoth(${modelProviderExpr})) IN ('', '${entry.provider}')`;
	const dimensions = [
		buildDimensionMultiplierSql({
			entry,
			dimension: "service_tier",
			valueExpr: serviceTierExpr,
			dateExpr,
		}),
		buildDimensionMultiplierSql({
			entry,
			dimension: "inference_speed",
			valueExpr: inferenceSpeedExpr,
			dateExpr,
		}),
		buildDimensionMultiplierSql({
			entry,
			dimension: "inference_geo",
			valueExpr: inferenceGeoExpr,
			dateExpr,
		}),
	];
	return `if(${providerIsCompatible}, ${dimensions.map((dimension) => `(${dimension})`).join(" * ")}, CAST(NULL, 'Nullable(Float64)'))`;
}

function buildRateSql({
	modelExpr,
	dateExpr,
	contextBand,
	contextInputExpr,
	modelProviderExpr,
	serviceTierExpr,
	inferenceSpeedExpr,
	inferenceGeoExpr,
	rateSelector,
}: {
	modelExpr: string;
	dateExpr: string;
	contextBand: ModelContextBand;
	contextInputExpr: string | undefined;
	modelProviderExpr: string;
	serviceTierExpr: string;
	inferenceSpeedExpr: string;
	inferenceGeoExpr: string;
	rateSelector: RateSelector;
}) {
	const clauses = MODEL_RATE_CARD.filter(
		(entry) =>
			contextInputExpr !== undefined || entry.contextBand === contextBand,
	).flatMap((entry) => {
		const dateConditions = [
			`toDate(${dateExpr}) >= toDate('${entry.effectiveFrom}')`,
		];
		if (contextInputExpr !== undefined) {
			const hasLongBand = MODEL_RATE_CARD.some(
				(candidate) =>
					candidate.model === entry.model && candidate.contextBand === "long",
			);
			if (entry.contextBand === "long") {
				dateConditions.push(
					`(${contextInputExpr}) > ${MODEL_LONG_CONTEXT_THRESHOLD_TOKENS}`,
				);
			} else if (hasLongBand) {
				dateConditions.push(
					`(${contextInputExpr}) <= ${MODEL_LONG_CONTEXT_THRESHOLD_TOKENS}`,
				);
			}
		}

		if (entry.effectiveTo !== undefined) {
			dateConditions.push(
				`toDate(${dateExpr}) <= toDate('${entry.effectiveTo}')`,
			);
		}

		const modifierSql = buildRateMultiplierSql({
			entry,
			dateExpr,
			modelProviderExpr,
			serviceTierExpr,
			inferenceSpeedExpr,
			inferenceGeoExpr,
		});
		return entry.match.flatMap((pattern) => [
			`match(lowerUTF8(${modelExpr}), '${escapeSqlString(pattern)}') AND ${dateConditions.join(" AND ")}`,
			entry[rateSelector] === null
				? "CAST(NULL, 'Nullable(Float64)')"
				: `toNullable(toFloat64(${entry[rateSelector]})) * (${modifierSql})`,
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
	contextInputExpr,
	modelProviderExpr = "''",
	serviceTierExpr = "''",
	inferenceSpeedExpr = "''",
	inferenceGeoExpr = "''",
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
	contextInputExpr?: string;
	modelProviderExpr?: string;
	serviceTierExpr?: string;
	inferenceSpeedExpr?: string;
	inferenceGeoExpr?: string;
	precision?: number;
}) {
	const rateExpressions = {
		modelExpr,
		dateExpr,
		contextBand,
		contextInputExpr,
		modelProviderExpr,
		serviceTierExpr,
		inferenceSpeedExpr,
		inferenceGeoExpr,
	};
	const inputRateSql = buildRateSql({
		...rateExpressions,
		rateSelector: "inputPerMTok",
	});
	const outputRateSql = buildRateSql({
		...rateExpressions,
		rateSelector: "outputPerMTok",
	});
	const cachedInputRateSql = buildRateSql({
		...rateExpressions,
		rateSelector: "cacheReadPerMTok",
	});
	const cacheWriteRateSql = buildRateSql({
		...rateExpressions,
		rateSelector: "cacheWrite5mPerMTok",
	});
	const cacheWrite1hRateSql = buildRateSql({
		...rateExpressions,
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

function formatModifierRow(
	entry: (typeof MODEL_RATE_MODIFIERS)[number],
): string {
	const period =
		entry.effectiveTo === undefined
			? `${entry.effectiveFrom} → current`
			: `${entry.effectiveFrom} → ${entry.effectiveTo}`;
	return `| [${entry.model}](${entry.source}) | ${entry.dimension} | ${entry.values.join(", ")} | ${period} | ${entry.contextBand ?? "all published"} | ${entry.multiplier}× | ${entry.verifiedAt} | ${entry.notes} |`;
}

function renderModifierTable(): string {
	return [
		"## Published pricing modifiers",
		"",
		"| Model | Dimension | Values | Effective period | Context | Multiplier | Verified | Notes |",
		"| --- | --- | --- | --- | --- | ---: | --- | --- |",
		...MODEL_RATE_MODIFIERS.map(formatModifierRow),
	].join("\n");
}

function renderUnpricedIdentityTable(): string {
	return [
		"## Known identities without a comparable public API rate",
		"",
		"| Identity | Provider | Reason | Verified | Notes |",
		"| --- | --- | --- | --- | --- |",
		...MODEL_UNPRICED_IDENTITIES.map(
			(entry) =>
				`| [${entry.model}](${entry.source}) | ${entry.provider} | ${entry.reason} | ${entry.verifiedAt} | ${entry.notes} |`,
		),
	].join("\n");
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
		"Request-level callers price each token class from the event model, UTC usage date, context, and supported modifiers. Unknown models, unsupported modifier combinations, and known identities without a comparable public API rate return no estimate rather than inheriting a family or session price.",
		"",
		sections.join("\n\n"),
		"",
		renderModifierTable(),
		"",
		renderUnpricedIdentityTable(),
		"",
	].join("\n");
}
