import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import {
	getSessionDetailSkeletonDebugKey,
	getSessionDetailSkeletonTurnPolicy,
	getStableSessionSkeletonWidth,
	resolveSessionDetailSkeletonDebugMode,
} from "./session-detail-skeleton-debug";

describe("session detail skeleton debug mode", () => {
	it("recognizes development-only hold, mix, and bounded delay modes", () => {
		expect(resolveSessionDetailSkeletonDebugMode("hold", true)).toEqual({
			kind: "hold",
		});
		expect(resolveSessionDetailSkeletonDebugMode("mix", true)).toEqual({
			kind: "mix",
		});
		expect(resolveSessionDetailSkeletonDebugMode("delay:3000", true)).toEqual({
			delayMs: 3000,
			kind: "delay",
		});
		expect(resolveSessionDetailSkeletonDebugMode("delay:999999", true)).toEqual(
			{
				delayMs: 60_000,
				kind: "delay",
			},
		);
		expect(resolveSessionDetailSkeletonDebugMode("delay:nope", true)).toEqual({
			kind: "off",
		});
	});

	it("hard-disables every query value outside development", () => {
		for (const value of ["hold", "mix", "delay:3000"]) {
			expect(resolveSessionDetailSkeletonDebugMode(value, false)).toEqual({
				kind: "off",
			});
		}
	});

	it("holds alternating turns in mix mode and delays only hydrated turns", () => {
		const mix = resolveSessionDetailSkeletonDebugMode("mix", true);
		expect(getSessionDetailSkeletonTurnPolicy(mix, 0)).toEqual({
			delayMs: 0,
			hydrate: false,
		});
		expect(getSessionDetailSkeletonTurnPolicy(mix, 1)).toEqual({
			delayMs: 0,
			hydrate: true,
		});
		expect(
			getSessionDetailSkeletonTurnPolicy(
				resolveSessionDetailSkeletonDebugMode("delay:3000", true),
				0,
			),
		).toEqual({ delayMs: 3000, hydrate: true });
		expect(
			getSessionDetailSkeletonDebugKey(
				resolveSessionDetailSkeletonDebugMode("delay:3000", true),
			),
		).toBe("delay:3000");
	});

	it("derives stable, bounded shimmer widths from the turn id", () => {
		const first = getStableSessionSkeletonWidth("turn-alpha", "message", 2);
		const repeated = getStableSessionSkeletonWidth("turn-alpha", "message", 2);
		const neighboring = getStableSessionSkeletonWidth(
			"turn-alpha",
			"message",
			3,
		);

		expect(first).toBe(repeated);
		expect(first).toBeGreaterThanOrEqual(48);
		expect(first).toBeLessThanOrEqual(92);
		expect(neighboring).not.toBe(first);
	});

	it("renders the overview shape at its natural height", () => {
		const option = createSkeletonOption();
		const view = render(
			createElement(SessionContinuousTurnSkeleton, {
				continuesThread: true,
				option,
				userLabel: "Evren",
			}),
		);
		const skeleton = view.container.querySelector<HTMLElement>(
			"[data-session-turn-skeleton]",
		);

		// No fixed-height clamp: the skeleton flows at its natural height so
		// hydration swaps shift layout as little as its estimate error, not by
		// an arbitrary clipped box.
		expect(skeleton?.style.height).toBe("");
		expect(view.getAllByText(option.memberPreview)).toHaveLength(2);
		expect(
			view.container.querySelectorAll(
				'[data-session-skeleton-row-kind="message"]',
			),
		).toHaveLength(2);
		expect(
			view.container.querySelectorAll(
				'[data-session-skeleton-row-kind="tool"]',
			),
		).toHaveLength(3);
		expect(
			view.container.querySelectorAll(
				'[data-session-skeleton-row-kind="error"]',
			),
		).toHaveLength(2);
		expect(
			view.container.querySelectorAll(
				'[data-session-skeleton-row-kind="skill-chips"] [data-slot="skeleton"]',
			),
		).toHaveLength(2);
		expect(
			view.container.querySelectorAll(
				'[data-session-skeleton-row-kind="file-chips"] [data-slot="skeleton"]',
			),
		).toHaveLength(1);
		expect(
			view.container.querySelector(
				"[data-session-skeleton-preview-continuation]",
			),
		).not.toBeNull();

		const firstWidths = getSkeletonWidths(view.container);
		view.rerender(
			createElement(SessionContinuousTurnSkeleton, {
				continuesThread: true,
				option,
				userLabel: "Evren",
			}),
		);
		expect(getSkeletonWidths(view.container)).toEqual(firstWidths);
	});
});

function getSkeletonWidths(container: HTMLElement) {
	return Array.from(
		container.querySelectorAll<HTMLElement>("[data-slot='skeleton']"),
		(element) => element.style.width,
	);
}

function createSkeletonOption(): SessionDetailOverviewTurnOption {
	return {
		compactionsBefore: [],
		hasBody: true,
		key: "turn-shape",
		memberPreview: "u".repeat(140),
		memberText: "u".repeat(140),
		metrics: {
			editedFiles: ["src/one.ts"],
			errorCount: 2,
			errorEvents: [],
			estimatedCost: 1,
			inputTokens: 100,
			outputTokens: 20,
			skills: ["ui", "testing-bun"],
			skillEvents: [],
			usageEvents: [
				{
					at: "2026-08-16T12:00:00.000Z",
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
					inputTokens: 80,
					model: "claude-opus-4-1",
					outputTokens: 10,
				},
				{
					at: "2026-08-16T12:00:01.000Z",
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
					inputTokens: 20,
					model: "claude-opus-4-1",
					outputTokens: 10,
				},
			],
		},
		preview: "Assistant preview",
		slashCommands: [],
		timing: {
			durationLabel: "1 sec",
			durationSeconds: 1,
			endTime: "12:00",
			startTime: "12:00",
		},
		toolCallCount: 3,
		turnId: "turn-shape",
		turnNumber: 1,
	};
}
