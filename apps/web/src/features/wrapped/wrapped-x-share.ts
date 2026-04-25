interface BuildWrappedXShareTextInput {
	archetypeLabel: string;
	displayName: string;
	totalSessions?: number | null;
	totalTokens?: number | null;
}

interface BuildWrappedXIntentUrlInput {
	text: string;
	url?: string;
}

interface WrappedXShareCopy {
	hook: string;
	story: (input: { metrics: string; possessiveName: string }) => string;
}

const WRAPPED_X_INTENT_URL = "https://twitter.com/intent/tweet";

const WRAPPED_X_SHARE_COPY_BY_ARCHETYPE: Record<string, WrappedXShareCopy> = {
	"adhd brain": {
		hook: "One thread was never going to be enough.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back ADHD Brain: ${metrics}, tabs everywhere, somehow progress everywhere too.`,
	},
	cheapskate: {
		hook: "Maximum output. Suspiciously efficient invoice.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Cheapskate: ${metrics}, squeezing every token until it squeaked.`,
	},
	"company card": {
		hook: "Finance may want a word.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Company Card: ${metrics}, and the card did not tap itself.`,
	},
	decimal: {
		hook: "Precision is a personality trait.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Decimal: ${metrics}, clean edges and expensive taste.`,
	},
	"hit and runner": {
		hook: "Show up. Ship. Vanish.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Hit and Runner: ${metrics}, quick commits and no lingering at the scene.`,
	},
	maniac: {
		hook: "This is less a recap, more a wellness check.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Maniac: ${metrics}, no chill detected.`,
	},
	npc: {
		hook: "Made chaos look scheduled.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Smooth Operator: ${metrics}, calm hands on a loud machine.`,
	},
	obsessed: {
		hook: "Touched grass? Unclear. Shipped anyway.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Obsessed: ${metrics}, and the repo probably filed a noise complaint.`,
	},
	"papas credit card": {
		hook: "Finance may want a word.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Company Card: ${metrics}, and the card did not tap itself.`,
	},
	roadrunner: {
		hook: "Fast enough to need a speed limit.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Roadrunner: ${metrics}, all gas and very little warm-up lap.`,
	},
	"smooth operator": {
		hook: "Made chaos look scheduled.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Smooth Operator: ${metrics}, calm hands on a loud machine.`,
	},
	tourist: {
		hook: "Visited every corner of the codebase.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Tourist: ${metrics}, lots of stamps in the repo passport.`,
	},
	"window shopper": {
		hook: "Maximum output. Suspiciously efficient invoice.",
		story: ({ metrics, possessiveName }) =>
			`${possessiveName} Wrapped came back Cheapskate: ${metrics}, squeezing every token until it squeaked.`,
	},
};

const DEFAULT_WRAPPED_X_SHARE_COPY: WrappedXShareCopy = {
	hook: "The receipts are in.",
	story: ({ metrics, possessiveName }) =>
		`${possessiveName} Claude Wrapped came back loud: ${metrics}, one card with a lot to explain.`,
};

export function buildWrappedXShareText(input: BuildWrappedXShareTextInput) {
	const { archetypeLabel, displayName, totalSessions, totalTokens } = input;
	const normalizedArchetypeLabel =
		normalizeWrappedXArchetypeLabel(archetypeLabel);
	const copy =
		WRAPPED_X_SHARE_COPY_BY_ARCHETYPE[normalizedArchetypeLabel] ??
		DEFAULT_WRAPPED_X_SHARE_COPY;
	const metrics = formatWrappedXShareMetrics({
		totalSessions,
		totalTokens,
	});

	return [
		copy.hook,
		copy.story({
			metrics,
			possessiveName: formatWrappedXPossessiveName(displayName),
		}),
		"Make yours:",
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

function formatWrappedXPossessiveName(displayName: string) {
	const trimmedDisplayName = displayName.trim() || "Your";

	return trimmedDisplayName.endsWith("s")
		? `${trimmedDisplayName}'`
		: `${trimmedDisplayName}'s`;
}

function normalizeWrappedXArchetypeLabel(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/['’]/gu, "")
		.replace(/[_-]+/gu, " ")
		.replace(/\s+/gu, " ");
}
