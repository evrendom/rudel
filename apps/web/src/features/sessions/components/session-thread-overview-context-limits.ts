export type SessionOverviewContextWindow = {
	source: "catalog" | "observed";
	tokenLimit: number;
};

const ONE_MILLION_TOKENS = 1_000_000;
const OPENAI_FRONTIER_CONTEXT_TOKENS = 1_050_000;
const CODEX_SOL_CONTEXT_TOKENS = 272_000;
const GPT_4_1_CONTEXT_TOKENS = 1_047_576;
const OPENAI_CODE_CONTEXT_TOKENS = 400_000;
const LEGACY_CLAUDE_CONTEXT_TOKENS = 200_000;

const FABLE_MODEL_PATTERN = /^claude-fable-5(?:-\d{8})?$/;
const SOL_MODEL_PATTERN = /^gpt-5\.6(?:-sol)?$/;

function hasPrefix(model: string, prefixes: readonly string[]) {
	return prefixes.some((prefix) => model.startsWith(prefix));
}

// Keep the Liveline capacity scale intentionally limited to models whose
// ceilings have been individually verified. Codex token events override this
// fallback with their own model_context_window, including the 258,400-token
// usable window reported by older Sol sessions.
export function resolveLivelineInputTokenLimit(
	model: string | undefined,
): number | undefined {
	if (!model) {
		return undefined;
	}
	if (FABLE_MODEL_PATTERN.test(model)) {
		return ONE_MILLION_TOKENS;
	}
	if (SOL_MODEL_PATTERN.test(model)) {
		return CODEX_SOL_CONTEXT_TOKENS;
	}
	return undefined;
}

// The pricing rate card does not expose context capacity. Keep this compact
// family lookup beside the visualization until that catalog grows a dedicated
// field; unknown models deliberately fall back to the largest observed call.
export function resolveSessionOverviewContextWindow(
	model: string | undefined,
	largestObservedCall: number,
): SessionOverviewContextWindow {
	if (model) {
		if (model.startsWith("gpt-4.1")) {
			return { source: "catalog", tokenLimit: GPT_4_1_CONTEXT_TOKENS };
		}
		if (SOL_MODEL_PATTERN.test(model)) {
			return { source: "catalog", tokenLimit: CODEX_SOL_CONTEXT_TOKENS };
		}
		if (hasPrefix(model, ["gpt-5.4", "gpt-5.5", "gpt-5.6"])) {
			return {
				source: "catalog",
				tokenLimit: OPENAI_FRONTIER_CONTEXT_TOKENS,
			};
		}
		if (
			hasPrefix(model, [
				"claude-fable-5",
				"claude-mythos-5",
				"claude-opus-5",
				"claude-opus-4-6",
				"claude-opus-4-7",
				"claude-opus-4-8",
				"claude-sonnet-5",
				"claude-sonnet-4-6",
			])
		) {
			return { source: "catalog", tokenLimit: ONE_MILLION_TOKENS };
		}
		if (
			model.startsWith("gpt-5") ||
			model.startsWith("codex-") ||
			model.includes("codex")
		) {
			return { source: "catalog", tokenLimit: OPENAI_CODE_CONTEXT_TOKENS };
		}
		if (model.startsWith("claude-")) {
			return { source: "catalog", tokenLimit: LEGACY_CLAUDE_CONTEXT_TOKENS };
		}
	}

	return {
		source: "observed",
		tokenLimit: Math.max(largestObservedCall, 1),
	};
}
