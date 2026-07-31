import { WRAPPED_SHARE_RESOURCE_LIMITS } from "@rudel/api-routes";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardStatItem,
} from "./card";

const DEFAULT_RESIZE_OBSERVER = globalThis.ResizeObserver;
let observedTargets = new Set<Element>();
let resizeObserverCount = 0;

afterEach(() => {
	globalThis.ResizeObserver = DEFAULT_RESIZE_OBSERVER;
});

describe("WrappedTeamMemberCard resource budget", () => {
	it("renders the maximum supported stat item count", () => {
		const { container } = render(
			<WrappedTeamMemberCard
				row={ROW}
				statItems={createStatItems(WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount)}
			/>,
		);

		expect(container.querySelectorAll('[title^="Stat "]')).toHaveLength(
			WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
		);
	});

	it("caps one-over input before creating DOM and observer work", () => {
		observedTargets = new Set<Element>();
		resizeObserverCount = 0;
		globalThis.ResizeObserver = RecordingResizeObserver;

		const { container } = render(
			<WrappedTeamMemberCard
				row={ROW}
				statItems={createStatItems(
					WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
				)}
			/>,
		);

		expect(container.querySelectorAll('[title^="Stat "]')).toHaveLength(
			WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
		);
		expect(resizeObserverCount).toBe(1);
		expect(observedTargets.size).toBe(
			WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
		);
	});
});

class RecordingResizeObserver implements ResizeObserver {
	constructor(_callback: ResizeObserverCallback) {
		resizeObserverCount += 1;
	}

	disconnect() {}

	observe(target: Element) {
		observedTargets.add(target);
	}

	unobserve(target: Element) {
		observedTargets.delete(target);
	}
}

function createStatItems(count: number): WrappedTeamMemberCardStatItem[] {
	return Array.from({ length: count }, (_, index) => ({
		key: `stat-${index}`,
		label: "STAT",
		title: `Stat ${index}`,
		value: `${index}`,
	}));
}

const ROW: TeamPageMemberRow = {
	activeDays: 6,
	cost: 42,
	displayName: "Evren",
	email: null,
	favoriteModel: "o3",
	hasActivity: true,
	imageUrl: null,
	inputTokens: 120,
	lastActiveDate: "2026-04-22",
	outputTokens: 240,
	role: "Builder",
	totalSessions: 12,
	totalTokens: 360,
	userId: "user-1",
};
