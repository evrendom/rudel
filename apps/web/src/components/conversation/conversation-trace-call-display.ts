import type { CSSProperties } from "react";
import { formatTraceRequestTokens } from "./conversation-trace-requests";

export type TraceCallDisplayMode = "normal" | "request";

export type TraceCallGroupTreatment = "none" | "fill" | "connector";

interface TraceCallGroupStyle extends CSSProperties {
	"--conversation-trace-call-accent": string;
	"--conversation-trace-connector-color": string;
	"--conversation-trace-connector-width": number;
	"--conversation-trace-row-surface": string;
}

const TRACE_CALL_ACCENTS: readonly string[] = [
	"oklch(61% 0.19 255)",
	"oklch(62% 0.18 305)",
	"oklch(65% 0.15 165)",
	"oklch(68% 0.16 60)",
	"oklch(62% 0.18 20)",
];

export type TraceCallDisplayConfig = {
	header:
		| "always"
		| "multi-only"
		| "separator"
		| "separator-multi-only"
		| "none";
	label: "request" | "model-call" | "none";
	inputPill: "absolute" | "delta";
	inlineUsageOnCollapsedRow: boolean;
	groupTreatment: TraceCallGroupTreatment;
	flatRequestRows: boolean;
};

const TRACE_CALL_DISPLAY_CONFIGS: Readonly<
	Record<TraceCallDisplayMode, TraceCallDisplayConfig>
> = {
	request: {
		flatRequestRows: false,
		groupTreatment: "none",
		header: "always",
		inputPill: "absolute",
		inlineUsageOnCollapsedRow: false,
		label: "request",
	},
	normal: {
		flatRequestRows: true,
		groupTreatment: "none",
		header: "none",
		inputPill: "absolute",
		inlineUsageOnCollapsedRow: false,
		label: "none",
	},
};

export function getTraceCallDisplayConfig(
	mode: TraceCallDisplayMode,
): TraceCallDisplayConfig {
	return TRACE_CALL_DISPLAY_CONFIGS[mode];
}

export function formatTraceCallContext(
	inputTotal: number,
	previousInputTotal: number | undefined,
): string {
	if (previousInputTotal === undefined) {
		return `ctx ${formatTraceRequestTokens(inputTotal)}`;
	}

	const delta = inputTotal - previousInputTotal;
	if (delta < 0) {
		return `−${formatTraceRequestTokens(Math.abs(delta))} ctx`;
	}
	return `+${formatTraceRequestTokens(delta)} ctx`;
}

export function shouldRenderTraceCallHeader(
	config: TraceCallDisplayConfig,
	branchCount: number,
): boolean {
	switch (config.header) {
		case "always":
		case "separator":
			return true;
		case "multi-only":
		case "separator-multi-only":
			return branchCount >= 2;
		case "none":
			return false;
	}
}

export function isTraceCallSeparator(config: TraceCallDisplayConfig): boolean {
	return (
		config.header === "separator" || config.header === "separator-multi-only"
	);
}

export function getTraceCallGroupStyle(
	groupIndex: number | undefined,
	treatment: TraceCallGroupTreatment,
): TraceCallGroupStyle {
	const accent =
		TRACE_CALL_ACCENTS[
			Math.max((groupIndex ?? 1) - 1, 0) % TRACE_CALL_ACCENTS.length
		] ??
		TRACE_CALL_ACCENTS[0] ??
		"var(--session-overview-accent)";

	return {
		"--conversation-trace-call-accent": accent,
		"--conversation-trace-connector-color":
			treatment === "connector" ? accent : "var(--session-overview-border)",
		"--conversation-trace-connector-width":
			treatment === "connector" ? 2.25 : 1,
		"--conversation-trace-row-surface":
			treatment === "fill"
				? `color-mix(in srgb, ${accent} 8%, var(--session-overview-surface))`
				: "var(--session-overview-surface)",
	};
}
