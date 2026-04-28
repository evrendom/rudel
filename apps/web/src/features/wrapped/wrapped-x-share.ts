import type { WrappedSourceSplit } from "@rudel/api-routes";

interface BuildWrappedXShareTextInput {
	archetypeLabel: string;
	displayName: string;
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
	totalSessions?: number | null;
	totalTokens?: number | null;
}

interface BuildWrappedXIntentUrlInput {
	text: string;
	url?: string;
}

interface WrappedXShareCopy {
	traits: string;
}

const WRAPPED_X_INTENT_URL = "https://twitter.com/intent/tweet";

const WRAPPED_X_SHARE_COPY_BY_ARCHETYPE: Record<string, WrappedXShareCopy> = {
	"adhd brain": {
		traits:
			"jumps between threads, keeps too many tabs warm, still turns chaos into progress",
	},
	cheapskate: {
		traits:
			"watches token spend, stretches each prompt, gets the answer without lighting money on fire",
	},
	"company card": {
		traits:
			"pushes usage hard, trusts the budget line, treats the meter like someone else's problem",
	},
	decimal: {
		traits:
			"cares about precision, trims the messy edges, does not tolerate fuzzy answers",
	},
	"hit and runner": {
		traits:
			"drops in fast, gets the thing shipped, disappears before the meeting gets scheduled",
	},
	maniac: {
		traits: "high session count, heavy token burn, no visible off switch",
	},
	obsessed: {
		traits:
			"keeps coming back, keeps digging deeper, probably knows the repo's floor plan",
	},
	roadrunner: {
		traits:
			"moves quickly, keeps sessions short, ships before the dust settles",
	},
	"smooth operator": {
		traits:
			"stays consistent, keeps the output clean, makes noisy work look routine",
	},
	tourist: {
		traits:
			"wanders across repos, samples every corner, collects project stamps",
	},
};

const DEFAULT_WRAPPED_X_SHARE_COPY: WrappedXShareCopy = {
	traits: "left enough receipts behind for the card to make a call",
};

export function buildWrappedXShareText(input: BuildWrappedXShareTextInput) {
	const {
		archetypeLabel,
		favoriteModel,
		sourceSplit,
		totalSessions,
		totalTokens,
	} = input;
	const normalizedArchetypeLabel =
		normalizeWrappedXArchetypeLabel(archetypeLabel);
	const copy =
		WRAPPED_X_SHARE_COPY_BY_ARCHETYPE[normalizedArchetypeLabel] ??
		DEFAULT_WRAPPED_X_SHARE_COPY;
	const metrics = formatWrappedXShareMetrics({
		totalSessions,
		totalTokens,
	});
	const archetypeIdentity = formatWrappedXArchetypeIdentity(archetypeLabel);
	const usageSourceLabel = formatWrappedXUsageSourceLabel({
		favoriteModel,
		sourceSplit,
	});

	return [
		`According to my ${usageSourceLabel} usage, I'm ${archetypeIdentity}.`,
		`Traits: ${metrics}; ${copy.traits}.`,
		"Make yours from the card.",
	].join("\n\n");
}

export function buildWrappedXIntentUrl(input: BuildWrappedXIntentUrlInput) {
	const intentUrl = new URL(WRAPPED_X_INTENT_URL);
	const { text, url } = input;

	intentUrl.searchParams.set("text", text);

	if (url) {
		intentUrl.searchParams.set("url", url);
	}

	return intentUrl.toString();
}

function formatWrappedXShareMetrics(input: {
	totalSessions?: number | null;
	totalTokens?: number | null;
}) {
	const { totalSessions, totalTokens } = input;
	const tokenLabel =
		totalTokens && Number.isFinite(totalTokens) && totalTokens > 0
			? `${formatWrappedXCompactNumber(totalTokens)} tokens`
			: null;
	const sessionLabel =
		totalSessions && Number.isFinite(totalSessions) && totalSessions > 0
			? `${formatWrappedXCompactNumber(totalSessions)} sessions`
			: null;

	if (tokenLabel && sessionLabel) {
		return `${tokenLabel} over ${sessionLabel}`;
	}

	return tokenLabel ?? sessionLabel ?? "the receipts are louder than expected";
}

function formatWrappedXCompactNumber(value: number) {
	const integerValue = Math.round(Math.max(0, value));

	if (integerValue >= 1_000_000) {
		return `${formatWrappedXScaledNumber(integerValue, 1_000_000)}M`;
	}

	if (integerValue >= 1000) {
		return `${formatWrappedXScaledNumber(integerValue, 1000)}K`;
	}

	return integerValue.toString();
}

function formatWrappedXScaledNumber(value: number, scale: number) {
	const scaledValue = value / scale;
	const roundedValue = roundWrappedXValueToSecondDigit(scaledValue);

	return roundedValue.toLocaleString("en-US", {
		maximumFractionDigits: roundedValue < 10 ? 1 : 0,
	});
}

function roundWrappedXValueToSecondDigit(value: number) {
	const digitMagnitude = 10 ** Math.floor(Math.log10(value));
	const roundingScale = digitMagnitude / 10;

	return Math.round(value / roundingScale) * roundingScale;
}

function formatWrappedXArchetypeIdentity(archetypeLabel: string) {
	const trimmedArchetypeLabel = archetypeLabel.trim() || "Wrapped mystery";
	const normalizedArchetypeLabel = normalizeWrappedXArchetypeLabel(
		trimmedArchetypeLabel,
	);

	if (normalizedArchetypeLabel === "obsessed") {
		return trimmedArchetypeLabel;
	}

	return `${getWrappedXIndefiniteArticle(trimmedArchetypeLabel)} ${trimmedArchetypeLabel}`;
}

function getWrappedXIndefiniteArticle(value: string) {
	return /^[aeiou]/iu.test(value) || /^adhd\b/iu.test(value) ? "an" : "a";
}

function formatWrappedXUsageSourceLabel(input: {
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
}) {
	const sourceUsage = getWrappedXSourceUsage(input.sourceSplit ?? []);

	if (sourceUsage.claude && !sourceUsage.codex) {
		return "Claude";
	}

	if (sourceUsage.codex && !sourceUsage.claude) {
		return "Codex";
	}

	if (sourceUsage.claude && sourceUsage.codex) {
		return "Claude / Codex";
	}

	return getWrappedXUsageSourceLabelFromFavoriteModel(input.favoriteModel);
}

function getWrappedXSourceUsage(sourceSplit: readonly WrappedSourceSplit[]) {
	let claude = false;
	let codex = false;

	for (const sourceEntry of sourceSplit) {
		const hasUsage =
			sourceEntry.session_count > 0 || sourceEntry.session_share_percent > 0;

		if (sourceEntry.source === "claude_code") {
			claude = claude || hasUsage;
		} else {
			codex = codex || hasUsage;
		}
	}

	return { claude, codex };
}

function getWrappedXUsageSourceLabelFromFavoriteModel(
	favoriteModel: string | null | undefined,
) {
	const normalizedFavoriteModel = favoriteModel?.trim().toLowerCase() ?? "";

	if (normalizedFavoriteModel.includes("claude")) {
		return "Claude";
	}

	if (
		normalizedFavoriteModel.includes("codex") ||
		normalizedFavoriteModel.includes("gpt") ||
		normalizedFavoriteModel.includes("openai")
	) {
		return "Codex";
	}

	return "Claude / Codex";
}

function normalizeWrappedXArchetypeLabel(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/['’]/gu, "")
		.replace(/[_-]+/gu, " ")
		.replace(/\s+/gu, " ");
}
