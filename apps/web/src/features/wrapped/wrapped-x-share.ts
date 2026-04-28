import type { WrappedSourceSplit } from "@rudel/api-routes";
import { formatCurrency } from "@/lib/format";

interface BuildWrappedXShareTextInput {
	activeDays?: number | null;
	archetypeLabel: string;
	avgSessionMin?: number | null;
	commitRate?: number | null;
	cost?: number | null;
	daysSinceFirst?: number | null;
	distinctProjectCount?: number | null;
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
const WRAPPED_X_SHARE_HASHTAG = "#RudelWrapped";

const WRAPPED_X_SHARE_COPY_BY_ARCHETYPE: Record<string, WrappedXShareCopy> = {
	decimal: {
		traits:
			"cares about precision, trims the messy edges, does not tolerate fuzzy answers",
	},
	roadrunner: {
		traits:
			"moves quickly, keeps sessions short, ships before the dust settles",
	},
};

const DEFAULT_WRAPPED_X_SHARE_COPY: WrappedXShareCopy = {
	traits: "left enough receipts behind for the card to make a call",
};

export function buildWrappedXShareText(input: BuildWrappedXShareTextInput) {
	const {
		activeDays,
		archetypeLabel,
		avgSessionMin,
		commitRate,
		cost,
		daysSinceFirst,
		distinctProjectCount,
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
	const openingLine = `My ${usageSourceLabel} usage says I'm ${archetypeIdentity}.`;

	if (normalizedArchetypeLabel === "roadrunner") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXRoadrunnerShareBody({
					activeDays,
					cost,
					daysSinceFirst,
					totalSessions,
				}),
			].join("\n\n"),
		);
	}

	if (normalizedArchetypeLabel === "company card") {
		return appendWrappedXShareHashtag(
			[
				`My ${usageSourceLabel} usage says I got the Company Card...`,
				buildWrappedXCompanyCardShareBody({
					commitRate,
					cost,
					favoriteModel,
					sourceSplit,
					totalSessions,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "adhd brain") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXAdhdBrainShareBody({
					activeDays,
					commitRate,
					daysSinceFirst,
					distinctProjectCount,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "cheapskate") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXCheapskateShareBody({
					commitRate,
					cost,
					totalSessions,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "hit and runner") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXHitAndRunnerShareBody({
					avgSessionMin,
					commitRate,
					distinctProjectCount,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "maniac") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXManiacShareBody({
					activeDays,
					daysSinceFirst,
					distinctProjectCount,
					totalSessions,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "obsessed") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXObsessedShareBody({
					activeDays,
					commitRate,
					daysSinceFirst,
					distinctProjectCount,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "smooth operator") {
		return appendWrappedXShareHashtag(
			[
				`My ${usageSourceLabel} usage says I'm a Smooooooth Operator.`,
				buildWrappedXSmoothOperatorShareBody({
					activeDays,
					avgSessionMin,
					daysSinceFirst,
					totalSessions,
				}),
			].join(" "),
		);
	}

	if (normalizedArchetypeLabel === "tourist") {
		return appendWrappedXShareHashtag(
			[
				openingLine,
				buildWrappedXTouristShareBody({
					commitRate,
					cost,
					favoriteModel,
					sourceSplit,
					totalSessions,
				}),
			].join(" "),
		);
	}

	return appendWrappedXShareHashtag(
		[openingLine, `Traits: ${metrics}; ${copy.traits}.`].join("\n\n"),
	);
}

export function buildWrappedXIntentUrl(input: BuildWrappedXIntentUrlInput) {
	const intentUrl = new URL(WRAPPED_X_INTENT_URL);
	const { text, url } = input;
	const resolvedText = url ? appendWrappedXSharePublicLink(text, url) : text;

	intentUrl.searchParams.set("text", resolvedText);

	return intentUrl.toString();
}

function appendWrappedXSharePublicLink(text: string, url: string) {
	return [
		text,
		`Check my profile out here ${url}`,
		"[Your image is in your clipboard, pls paste and dont forget]",
	].join("\n\n");
}

function appendWrappedXShareHashtag(text: string) {
	return [text, WRAPPED_X_SHARE_HASHTAG].join("\n\n");
}

function buildWrappedXRoadrunnerShareBody(input: {
	activeDays?: number | null;
	cost?: number | null;
	daysSinceFirst?: number | null;
	totalSessions?: number | null;
}) {
	const activeDays = formatWrappedXWholeNumber(input.activeDays);
	const daysSinceFirst = formatWrappedXWholeNumber(input.daysSinceFirst);
	const costPerSession = formatCurrency(
		input.cost && input.totalSessions && input.totalSessions > 0
			? input.cost / input.totalSessions
			: 0,
	);

	return [
		"Meep meep.",
		`Active ${activeDays} out of ${daysSinceFirst} days.`,
		"Meep meep.",
		`When back I'm spending ${costPerSession} a session.`,
		"Meep meep.",
		"Gone.",
	].join("\n\n");
}

function buildWrappedXManiacShareBody(input: {
	activeDays?: number | null;
	daysSinceFirst?: number | null;
	distinctProjectCount?: number | null;
	totalSessions?: number | null;
}) {
	const activeDays = formatWrappedXWholeNumber(input.activeDays);
	const daysSinceFirst = formatWrappedXWholeNumber(input.daysSinceFirst);
	const distinctProjectCount = formatWrappedXWholeNumber(
		input.distinctProjectCount,
	);
	const sessionsPerActiveDay = formatWrappedXSessionsPerActiveDay({
		activeDays: input.activeDays,
		totalSessions: input.totalSessions,
	});

	return `Active ${activeDays} out of ${daysSinceFirst} days, ${distinctProjectCount} repos, ${sessionsPerActiveDay} sessions per active day. Yeah, you should be a little scared.`;
}

function buildWrappedXCompanyCardShareBody(input: {
	commitRate?: number | null;
	cost?: number | null;
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
	totalSessions?: number | null;
}) {
	const totalSessions = formatWrappedXWholeNumber(input.totalSessions);
	const commitRate = formatWrappedXWholeNumber(input.commitRate);
	const totalCost = formatWrappedXWholeCurrency(input.cost);
	const happyLine = formatWrappedXCompanyCardHappyLine({
		favoriteModel: input.favoriteModel,
		sourceSplit: input.sourceSplit,
	});

	return `${totalSessions} sessions, ${commitRate}% shipped something, ${totalCost} in total. ${happyLine}`;
}

function buildWrappedXAdhdBrainShareBody(input: {
	activeDays?: number | null;
	commitRate?: number | null;
	daysSinceFirst?: number | null;
	distinctProjectCount?: number | null;
}) {
	const activeDays = formatWrappedXWholeNumber(input.activeDays);
	const daysSinceFirst = formatWrappedXWholeNumber(input.daysSinceFirst);
	const distinctProjectCount = formatWrappedXWholeNumber(
		input.distinctProjectCount,
	);
	const commitRate = formatWrappedXWholeNumber(input.commitRate);

	return `${activeDays} out of ${daysSinceFirst} days, ${distinctProjectCount} repos, ${commitRate}% shipped. DaVinci also had many projects! I'm his reincarnation.. i guess.`;
}

function buildWrappedXHitAndRunnerShareBody(input: {
	avgSessionMin?: number | null;
	commitRate?: number | null;
	distinctProjectCount?: number | null;
}) {
	const avgSessionMin = formatWrappedXWholeNumber(input.avgSessionMin);
	const distinctProjectCount = formatWrappedXWholeNumber(
		input.distinctProjectCount,
	);
	const commitRate = formatWrappedXWholeNumber(input.commitRate);

	return `${avgSessionMin} minute sessions, ${distinctProjectCount} repos, ${commitRate}% shipped. Veni, vidi, commit. In, out, no witnesses.`;
}

function buildWrappedXCheapskateShareBody(input: {
	commitRate?: number | null;
	cost?: number | null;
	totalSessions?: number | null;
}) {
	const commitRate = formatWrappedXWholeNumber(input.commitRate);
	const costPerSession = formatCurrency(
		input.cost && input.totalSessions && input.totalSessions > 0
			? input.cost / input.totalSessions
			: 0,
	);

	return `${costPerSession} a session, ${commitRate}% shipped. Mr. Krabs is very proud of me. Spent less, shipped more. Very efficient. Pls don't ask me to pay for dinner though.`;
}

function buildWrappedXObsessedShareBody(input: {
	activeDays?: number | null;
	commitRate?: number | null;
	daysSinceFirst?: number | null;
	distinctProjectCount?: number | null;
}) {
	const activeDays = formatWrappedXWholeNumber(input.activeDays);
	const daysSinceFirst = formatWrappedXWholeNumber(input.daysSinceFirst);
	const distinctProjectCount = formatWrappedXWholeNumber(
		input.distinctProjectCount,
	);
	const commitRate = formatWrappedXWholeNumber(input.commitRate);

	return `${distinctProjectCount} repo, ${activeDays} out of ${daysSinceFirst} days, ${commitRate}% of sessions shipped something. Apparently I have nothing else in my life. I dare you to distract me.`;
}

function buildWrappedXSmoothOperatorShareBody(input: {
	activeDays?: number | null;
	avgSessionMin?: number | null;
	daysSinceFirst?: number | null;
	totalSessions?: number | null;
}) {
	const activeDays = formatWrappedXWholeNumber(input.activeDays);
	const daysSinceFirst = formatWrappedXWholeNumber(input.daysSinceFirst);
	const avgSessionMin = formatWrappedXWholeNumber(input.avgSessionMin);
	const sessionsPerActiveDay = formatWrappedXSessionsPerActiveDay({
		activeDays: input.activeDays,
		totalSessions: input.totalSessions,
	});

	return `Active ${activeDays} out of ${daysSinceFirst} days, ${avgSessionMin} minute average session, ${sessionsPerActiveDay} a day. Haters gonna try to find something on me, but they can't because I'm a smooooth operator.`;
}

function buildWrappedXTouristShareBody(input: {
	commitRate?: number | null;
	cost?: number | null;
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
	totalSessions?: number | null;
}) {
	const totalSessions = formatWrappedXWholeNumber(input.totalSessions);
	const commitRate = formatWrappedXWholeNumber(input.commitRate);
	const totalCost = formatWrappedXWholeCurrency(input.cost);
	const fallbackProduct = formatWrappedXTouristFallbackProduct({
		favoriteModel: input.favoriteModel,
		sourceSplit: input.sourceSplit,
	});

	return `${totalSessions} sessions, ${commitRate}% shipped, ${totalCost} spent in total.. I'm definitely not the person who'll get prompt injected by this OpenClaw thing. I'll stick to ${fallbackProduct}`;
}

function formatWrappedXCompanyCardHappyLine(input: {
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
}) {
	const usageSourceLabel = formatWrappedXUsageSourceLabel(input);

	if (usageSourceLabel === "Claude Code") {
		return "Dario's probably happy to have me.";
	}

	if (usageSourceLabel === "Codex") {
		return "Sam's probably happy to have me.";
	}

	return "Dario & Sam are probably happy to have me.";
}

function formatWrappedXTouristFallbackProduct(input: {
	favoriteModel?: string | null;
	sourceSplit?: readonly WrappedSourceSplit[];
}) {
	const usageSourceLabel = formatWrappedXUsageSourceLabel(input);

	return usageSourceLabel === "Codex" ? "ChatGPT" : "Claude";
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

function formatWrappedXWholeNumber(value: number | null | undefined) {
	return Math.round(Math.max(0, value ?? 0)).toLocaleString("en-US");
}

function formatWrappedXWholeCurrency(value: number | null | undefined) {
	return `$${formatWrappedXWholeNumber(value)}`;
}

function formatWrappedXSessionsPerActiveDay(input: {
	activeDays?: number | null;
	totalSessions?: number | null;
}) {
	const activeDays = Math.max(0, input.activeDays ?? 0);
	const totalSessions = Math.max(0, input.totalSessions ?? 0);
	const sessionsPerActiveDay = activeDays > 0 ? totalSessions / activeDays : 0;

	return sessionsPerActiveDay.toLocaleString("en-US", {
		maximumFractionDigits: 1,
	});
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
		return "Claude Code";
	}

	if (sourceUsage.codex && !sourceUsage.claude) {
		return "Codex";
	}

	if (sourceUsage.claude && sourceUsage.codex) {
		return "Claude Code and Codex";
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
		return "Claude Code";
	}

	if (
		normalizedFavoriteModel.includes("codex") ||
		normalizedFavoriteModel.includes("gpt") ||
		normalizedFavoriteModel.includes("openai")
	) {
		return "Codex";
	}

	return "Claude Code and Codex";
}

function normalizeWrappedXArchetypeLabel(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/['’]/gu, "")
		.replace(/[_-]+/gu, " ")
		.replace(/\s+/gu, " ");
}
