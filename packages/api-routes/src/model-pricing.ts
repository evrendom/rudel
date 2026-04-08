export type ModelPricingProvider = "anthropic" | "openai";

export type ModelPricingEntry = {
	key: string;
	displayName: string;
	provider: ModelPricingProvider;
	inputPerMillion: number;
	cachedInputPerMillion: number;
	cacheWritePerMillion: number;
	outputPerMillion: number;
	matchPatterns: readonly string[];
	sourceUrls: readonly string[];
};

export type ModelPricing = Omit<
	ModelPricingEntry,
	"matchPatterns" | "sourceUrls"
>;

export const MODEL_PRICING_CATALOG_VERSION = "2026-04-08";
export const ESTIMATED_PRICING_MODE = "estimated_model_pricing_v1" as const;

// Fallback pricing for unknown text models keeps historical dashboards usable
// while making the model-specific catalog the primary source of truth.
export const FALLBACK_MODEL_PRICING: ModelPricing = {
	key: "fallback-text",
	displayName: "Fallback text model pricing",
	provider: "anthropic",
	inputPerMillion: 3,
	cachedInputPerMillion: 0.3,
	cacheWritePerMillion: 3.75,
	outputPerMillion: 15,
};

// Sources:
// - OpenAI pricing: https://developers.openai.com/api/docs/pricing
// - GPT-5.1 Chat: https://developers.openai.com/api/docs/models/gpt-5.1-chat-latest
// - GPT-5.1 Codex Max: https://developers.openai.com/api/docs/models/gpt-5.1-codex-max
// - Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
// - Anthropic models overview: https://platform.claude.com/docs/en/about-claude/models/overview
//
// Anthropic prompt-cache writes are priced with the 5 minute write rate here.
// The current analytics schema tracks cache creation tokens, but not whether the
// underlying write used the 5 minute or 1 hour cache tier.
export const MODEL_PRICING_CATALOG = [
	{
		key: "openai-gpt-5.4-pro",
		displayName: "GPT-5.4 Pro",
		provider: "openai",
		inputPerMillion: 30,
		cachedInputPerMillion: 0,
		cacheWritePerMillion: 0,
		outputPerMillion: 180,
		matchPatterns: ["^gpt-5\\.4-pro$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.4-mini",
		displayName: "GPT-5.4 Mini",
		provider: "openai",
		inputPerMillion: 0.75,
		cachedInputPerMillion: 0.075,
		cacheWritePerMillion: 0.075,
		outputPerMillion: 4.5,
		matchPatterns: ["^gpt-5\\.4-mini$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.4-nano",
		displayName: "GPT-5.4 Nano",
		provider: "openai",
		inputPerMillion: 0.2,
		cachedInputPerMillion: 0.02,
		cacheWritePerMillion: 0.02,
		outputPerMillion: 1.25,
		matchPatterns: ["^gpt-5\\.4-nano$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.4",
		displayName: "GPT-5.4",
		provider: "openai",
		inputPerMillion: 2.5,
		cachedInputPerMillion: 0.25,
		cacheWritePerMillion: 0.25,
		outputPerMillion: 15,
		matchPatterns: ["^gpt-5\\.4$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.3-chat-latest",
		displayName: "GPT-5.3 Chat",
		provider: "openai",
		inputPerMillion: 1.75,
		cachedInputPerMillion: 0.175,
		cacheWritePerMillion: 0.175,
		outputPerMillion: 14,
		matchPatterns: ["^gpt-5\\.3-chat-latest$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.3-codex",
		displayName: "GPT-5.3 Codex",
		provider: "openai",
		inputPerMillion: 1.75,
		cachedInputPerMillion: 0.175,
		cacheWritePerMillion: 0.175,
		outputPerMillion: 14,
		matchPatterns: ["^gpt-5\\.3-codex$"],
		sourceUrls: ["https://developers.openai.com/api/docs/pricing"],
	},
	{
		key: "openai-gpt-5.1-chat-latest",
		displayName: "GPT-5.1 Chat",
		provider: "openai",
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		cacheWritePerMillion: 0.125,
		outputPerMillion: 10,
		matchPatterns: ["^gpt-5\\.1-chat-latest$", "^gpt-5-chat-latest$"],
		sourceUrls: [
			"https://developers.openai.com/api/docs/models/gpt-5.1-chat-latest",
		],
	},
	{
		key: "openai-gpt-5.1-codex-max",
		displayName: "GPT-5.1 Codex Max",
		provider: "openai",
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		cacheWritePerMillion: 0.125,
		outputPerMillion: 10,
		matchPatterns: ["^gpt-5\\.1-codex-max$", "^gpt-5-codex-max$"],
		sourceUrls: [
			"https://developers.openai.com/api/docs/models/gpt-5.1-codex-max",
		],
	},
	{
		key: "openai-gpt-5.1-codex-mini",
		displayName: "GPT-5.1 Codex Mini",
		provider: "openai",
		inputPerMillion: 0.25,
		cachedInputPerMillion: 0.025,
		cacheWritePerMillion: 0.025,
		outputPerMillion: 2,
		matchPatterns: ["^gpt-5\\.1-codex-mini$", "^gpt-5-codex-mini$"],
		sourceUrls: [
			"https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini",
		],
	},
	{
		key: "openai-gpt-5-codex",
		displayName: "GPT-5 Codex",
		provider: "openai",
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		cacheWritePerMillion: 0.125,
		outputPerMillion: 10,
		matchPatterns: ["^gpt-5\\.1-codex$", "^gpt-5-codex$"],
		sourceUrls: [
			"https://developers.openai.com/api/docs/models/gpt-5.1-codex-max",
		],
	},
	{
		key: "anthropic-claude-opus-4-6",
		displayName: "Claude Opus 4.6",
		provider: "anthropic",
		inputPerMillion: 5,
		cachedInputPerMillion: 0.5,
		cacheWritePerMillion: 6.25,
		outputPerMillion: 25,
		matchPatterns: ["^claude-opus-4-6(?:-\\d{8})?$"],
		sourceUrls: [
			"https://platform.claude.com/docs/en/about-claude/pricing",
			"https://platform.claude.com/docs/en/about-claude/models/overview",
		],
	},
	{
		key: "anthropic-claude-opus-4-5",
		displayName: "Claude Opus 4.5",
		provider: "anthropic",
		inputPerMillion: 5,
		cachedInputPerMillion: 0.5,
		cacheWritePerMillion: 6.25,
		outputPerMillion: 25,
		matchPatterns: ["^claude-opus-4-5(?:-\\d{8})?$"],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-opus-4-1",
		displayName: "Claude Opus 4.1",
		provider: "anthropic",
		inputPerMillion: 15,
		cachedInputPerMillion: 1.5,
		cacheWritePerMillion: 18.75,
		outputPerMillion: 75,
		matchPatterns: ["^claude-opus-4-1(?:-\\d{8})?$"],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-opus-4",
		displayName: "Claude Opus 4",
		provider: "anthropic",
		inputPerMillion: 15,
		cachedInputPerMillion: 1.5,
		cacheWritePerMillion: 18.75,
		outputPerMillion: 75,
		matchPatterns: ["^claude-opus-4(?:-\\d{8})?$"],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-sonnet-4-6",
		displayName: "Claude Sonnet 4.6",
		provider: "anthropic",
		inputPerMillion: 3,
		cachedInputPerMillion: 0.3,
		cacheWritePerMillion: 3.75,
		outputPerMillion: 15,
		matchPatterns: ["^claude-sonnet-4-6(?:-\\d{8})?$"],
		sourceUrls: [
			"https://platform.claude.com/docs/en/about-claude/pricing",
			"https://platform.claude.com/docs/en/about-claude/models/overview",
		],
	},
	{
		key: "anthropic-claude-sonnet-4-5",
		displayName: "Claude Sonnet 4.5",
		provider: "anthropic",
		inputPerMillion: 3,
		cachedInputPerMillion: 0.3,
		cacheWritePerMillion: 3.75,
		outputPerMillion: 15,
		matchPatterns: ["^claude-sonnet-4-5(?:-\\d{8})?$"],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-sonnet-4",
		displayName: "Claude Sonnet 4",
		provider: "anthropic",
		inputPerMillion: 3,
		cachedInputPerMillion: 0.3,
		cacheWritePerMillion: 3.75,
		outputPerMillion: 15,
		matchPatterns: ["^claude-sonnet-4(?:-\\d{8})?$"],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-sonnet-3-7",
		displayName: "Claude Sonnet 3.7",
		provider: "anthropic",
		inputPerMillion: 3,
		cachedInputPerMillion: 0.3,
		cacheWritePerMillion: 3.75,
		outputPerMillion: 15,
		matchPatterns: [
			"^claude-3-7-sonnet(?:-latest|-\\d{8})?$",
			"^claude-sonnet-3-7(?:-\\d{8})?$",
		],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-haiku-4-5",
		displayName: "Claude Haiku 4.5",
		provider: "anthropic",
		inputPerMillion: 1,
		cachedInputPerMillion: 0.1,
		cacheWritePerMillion: 1.25,
		outputPerMillion: 5,
		matchPatterns: [
			"^claude-haiku-4-5(?:-\\d{8})?$",
			"^claude-haiku-4-5-20251001$",
		],
		sourceUrls: [
			"https://platform.claude.com/docs/en/about-claude/pricing",
			"https://platform.claude.com/docs/en/about-claude/models/overview",
		],
	},
	{
		key: "anthropic-claude-haiku-3-5",
		displayName: "Claude Haiku 3.5",
		provider: "anthropic",
		inputPerMillion: 0.8,
		cachedInputPerMillion: 0.08,
		cacheWritePerMillion: 1,
		outputPerMillion: 4,
		matchPatterns: [
			"^claude-3-5-haiku(?:-latest|-\\d{8})?$",
			"^claude-haiku-3-5(?:-\\d{8})?$",
		],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-opus-3",
		displayName: "Claude Opus 3",
		provider: "anthropic",
		inputPerMillion: 15,
		cachedInputPerMillion: 1.5,
		cacheWritePerMillion: 18.75,
		outputPerMillion: 75,
		matchPatterns: [
			"^claude-3-opus(?:-latest|-\\d{8})?$",
			"^claude-opus-3(?:-\\d{8})?$",
		],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
	{
		key: "anthropic-claude-haiku-3",
		displayName: "Claude Haiku 3",
		provider: "anthropic",
		inputPerMillion: 0.25,
		cachedInputPerMillion: 0.03,
		cacheWritePerMillion: 0.3,
		outputPerMillion: 1.25,
		matchPatterns: [
			"^claude-3-haiku(?:-latest|-\\d{8})?$",
			"^claude-haiku-3(?:-\\d{8})?$",
		],
		sourceUrls: ["https://platform.claude.com/docs/en/about-claude/pricing"],
	},
] as const satisfies readonly ModelPricingEntry[];

function normalizeModelId(model: string | null | undefined) {
	return model?.trim().toLowerCase() ?? "";
}

function getResolvedPricing(model: string | null | undefined): ModelPricing {
	const normalizedModel = normalizeModelId(model);

	if (!normalizedModel) {
		return FALLBACK_MODEL_PRICING;
	}

	for (const entry of MODEL_PRICING_CATALOG) {
		if (
			entry.matchPatterns.some((pattern) =>
				new RegExp(pattern, "u").test(normalizedModel),
			)
		) {
			return entry;
		}
	}

	return FALLBACK_MODEL_PRICING;
}

export function resolveModelPricing(
	model: string | null | undefined,
): ModelPricing | null {
	const normalizedModel = normalizeModelId(model);

	if (!normalizedModel) {
		return null;
	}

	return getResolvedPricing(normalizedModel);
}

export function getModelPricingCatalog() {
	return MODEL_PRICING_CATALOG;
}

export function calculateEstimatedCost({
	model,
	inputTokens,
	outputTokens,
	cacheReadInputTokens = 0,
	cacheCreationInputTokens = 0,
	precision = 4,
}: {
	model?: string | null;
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	precision?: number;
}) {
	const pricing = getResolvedPricing(model);
	const cost =
		(inputTokens / 1_000_000) * pricing.inputPerMillion +
		(outputTokens / 1_000_000) * pricing.outputPerMillion +
		(cacheReadInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
		(cacheCreationInputTokens / 1_000_000) * pricing.cacheWritePerMillion;

	return Number(cost.toFixed(precision));
}

function escapeSqlString(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function buildRateSql(
	modelExpr: string,
	rateSelector: keyof Pick<
		ModelPricing,
		| "inputPerMillion"
		| "cachedInputPerMillion"
		| "cacheWritePerMillion"
		| "outputPerMillion"
	>,
) {
	const clauses = MODEL_PRICING_CATALOG.flatMap((entry) =>
		entry.matchPatterns.flatMap((pattern) => [
			`match(lowerUTF8(${modelExpr}), '${escapeSqlString(pattern)}')`,
			String(entry[rateSelector]),
		]),
	);

	const fallback = String(FALLBACK_MODEL_PRICING[rateSelector]);
	return `multiIf(${clauses.join(", ")}, ${fallback})`;
}

export function buildEstimatedCostSql({
	modelExpr,
	inputExpr,
	outputExpr,
	cacheReadInputExpr = "0",
	cacheCreationInputExpr = "0",
	precision,
}: {
	modelExpr: string;
	inputExpr: string;
	outputExpr: string;
	cacheReadInputExpr?: string;
	cacheCreationInputExpr?: string;
	precision?: number;
}) {
	const inputRateSql = buildRateSql(modelExpr, "inputPerMillion");
	const outputRateSql = buildRateSql(modelExpr, "outputPerMillion");
	const cachedInputRateSql = buildRateSql(modelExpr, "cachedInputPerMillion");
	const cacheWriteRateSql = buildRateSql(modelExpr, "cacheWritePerMillion");

	const expression = `((${inputExpr}) / 1000000.0) * (${inputRateSql}) + ((${outputExpr}) / 1000000.0) * (${outputRateSql}) + ((${cacheReadInputExpr}) / 1000000.0) * (${cachedInputRateSql}) + ((${cacheCreationInputExpr}) / 1000000.0) * (${cacheWriteRateSql})`;

	if (typeof precision === "number") {
		return `round(${expression}, ${precision})`;
	}

	return expression;
}
