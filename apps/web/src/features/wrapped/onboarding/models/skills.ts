import type { CSSProperties } from "react";
import { formatPercent } from "../format";
import type { WrappedSkillUsageItem } from "../types";

export const SKILLS_STACK = {
	cardHeightRem: 5.5,
	columnInsetRem: 0.45,
	focusTopRem: 4.65,
	interactionLockMs: 220,
	shadowBleedRem: 1,
	stepRem: 2.95,
	touchThresholdPx: 34,
	viewportHeightRem: 16.2,
	visibleCards: 3,
	wheelResetMs: 140,
	wheelThresholdPx: 36,
} as const;

interface SkillsCollapsedCardStyleInput {
	cardIndex: number;
	collapsedScaleStep: number;
	collapsedStepRem: number;
	totalCards: number;
	topRem: number;
	widthPercent: number;
}

export function resolveSkillsPreviewInput(
	input: {
		skillsAdoptionRate: number | null;
		topSkills: readonly WrappedSkillUsageItem[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "dominant":
			return {
				topSkills: [
					{ name: "Refactor", count: 42 },
					{ name: "Plan", count: 27 },
					{ name: "Test", count: 18 },
					{ name: "Review", count: 15 },
					{ name: "Explain", count: 14 },
					{ name: "Research", count: 12 },
					{ name: "Extract", count: 10 },
					{ name: "Debug", count: 8 },
					{ name: "Write Docs", count: 7 },
					{ name: "Migrate", count: 5 },
				],
				skillsAdoptionRate: 68,
			};
		case "dominant-no-rate":
			return {
				topSkills: [
					{ name: "Refactor", count: 33 },
					{ name: "Plan", count: 19 },
					{ name: "Explain", count: 14 },
					{ name: "Review", count: 12 },
					{ name: "Research", count: 10 },
					{ name: "Test", count: 8 },
					{ name: "Extract", count: 6 },
					{ name: "Summarize", count: 5 },
					{ name: "Migrate", count: 4 },
				],
				skillsAdoptionRate: null,
			};
		case "usage-no-winner":
			return {
				topSkills: [
					{ name: "Plan", count: 14 },
					{ name: "Refactor", count: 13 },
					{ name: "Research", count: 12 },
					{ name: "Review", count: 11 },
					{ name: "Test", count: 11 },
					{ name: "Explain", count: 10 },
					{ name: "Debug", count: 9 },
					{ name: "Extract", count: 9 },
					{ name: "Summarize", count: 8 },
				],
				skillsAdoptionRate: 24,
			};
		case "single-skill":
			return {
				topSkills: [{ name: "Refactor", count: 11 }],
				skillsAdoptionRate: 18,
			};
		case "no-signal":
			return { topSkills: [], skillsAdoptionRate: null };
		default:
			return input;
	}
}

export function resolveSkillsStageModel(input: {
	skillsAdoptionRate: number | null;
	topSkills: readonly WrappedSkillUsageItem[];
}) {
	const rankedSkills = input.topSkills.filter(
		(skill) => skill.name.trim().length > 0 && skill.count > 0,
	);
	const displayItems = rankedSkills.length > 0 ? [...rankedSkills] : [];

	const minimumVisibleItems = 3;
	while (displayItems.length < minimumVisibleItems) {
		displayItems.push(getSkillsPlaceholderItem(displayItems.length + 1));
	}

	const cardItems = displayItems.map((skill, index) => {
		const rank = index + 1;
		const isPlaceholder = skill.count === 0;

		return {
			id: `skill-rank-${rank}`,
			isPlaceholder,
			meta: isPlaceholder
				? getSkillsPlaceholderMeta(rank)
				: `${skill.count.toLocaleString()} use${skill.count === 1 ? "" : "s"}`,
			name: isPlaceholder ? getSkillsPlaceholderName(rank) : skill.name,
			rank,
		};
	});

	const cards = cardItems.map((item) => ({
		id: `skills-card-${item.rank}`,
		item,
	}));
	const visibleCardCount = Math.max(cards.length, SKILLS_STACK.visibleCards);
	const trackHeightRem =
		SKILLS_STACK.viewportHeightRem +
		(visibleCardCount - 1) * SKILLS_STACK.stepRem;
	const visibleSkillsCount = rankedSkills.length;
	const isScrollable = visibleSkillsCount > SKILLS_STACK.visibleCards;

	if (rankedSkills.length === 0) {
		return {
			cards,
			footnote: "",
			hasRankedSkills: false,
			headline: "You've got a skill issue.",
			isScrollable,
			subline: "",
			trackHeightRem,
		};
	}

	if (rankedSkills.length === 1) {
		return {
			cards,
			footnote:
				input.skillsAdoptionRate === null
					? "Only one skill has enough signal to make the board so far."
					: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`,
			hasRankedSkills: true,
			headline: `${rankedSkills[0]?.name} took the lead`,
			isScrollable,
			subline:
				"The board has a leader now. The next two spots are still taking shape.",
			trackHeightRem,
		};
	}

	const leaderName = rankedSkills[0]?.name ?? "One skill";
	const footnote = isScrollable
		? `${visibleSkillsCount.toLocaleString()} skills ranked. Scroll or swipe the cards to see the full board.`
		: input.skillsAdoptionRate === null
			? "Skill adoption is still settling."
			: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`;

	return {
		cards,
		footnote,
		hasRankedSkills: true,
		headline: `${leaderName} leads the board`,
		isScrollable,
		subline: "The skills that kept showing up across your sessions.",
		trackHeightRem,
	};
}

export function clampSkillsCardIndex(index: number, totalCards: number) {
	if (totalCards <= 0) {
		return 0;
	}

	return Math.min(Math.max(index, 0), totalCards - 1);
}

export function getSkillsCardStyle(
	cardIndex: number,
	activeCardIndex: number,
): CSSProperties {
	const relativeDepth = cardIndex - activeCardIndex;
	const isVisibleDepth =
		relativeDepth >= -1 && relativeDepth < SKILLS_STACK.visibleCards - 1;
	const zIndex =
		relativeDepth === 0
			? 40
			: relativeDepth === -1
				? 30
				: relativeDepth === 1
					? 20
					: 10;

	const depthStyles =
		relativeDepth === -1
			? { rotateDeg: -7, scale: 0.968, translateZ: 16, widthPercent: 96 }
			: relativeDepth === 0
				? { rotateDeg: 0, scale: 1, translateZ: 52, widthPercent: 100 }
				: relativeDepth === 1
					? { rotateDeg: 8, scale: 0.962, translateZ: 16, widthPercent: 96 }
					: { rotateDeg: 12, scale: 0.93, translateZ: -4, widthPercent: 92 };

	return {
		"--skills-card-y": `${relativeDepth * SKILLS_STACK.stepRem}rem`,
		"--skills-card-scale": depthStyles.scale,
		"--skills-card-rotate": `${depthStyles.rotateDeg}deg`,
		"--skills-card-z": `${depthStyles.translateZ}px`,
		filter: isVisibleDepth ? "blur(0px)" : "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: isVisibleDepth ? "auto" : "none",
		top: `${SKILLS_STACK.focusTopRem}rem`,
		width: `calc(${depthStyles.widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex,
	} as CSSProperties;
}

export function getSkillsCollapsedCardStyle(
	input: SkillsCollapsedCardStyleInput,
): CSSProperties {
	const {
		cardIndex,
		collapsedScaleStep,
		collapsedStepRem,
		totalCards,
		topRem,
		widthPercent,
	} = input;
	const usableCardCount = Math.max(totalCards, 1);
	const maxStepRem =
		usableCardCount === 1
			? 0
			: Math.max(
					0,
					(SKILLS_STACK.viewportHeightRem - topRem - SKILLS_STACK.cardHeightRem) /
						(usableCardCount - 1),
				);
	const resolvedStepRem = Math.min(collapsedStepRem, maxStepRem);
	const scale = Math.max(0.88, 1 - cardIndex * collapsedScaleStep);

	return {
		"--skills-card-y": `${cardIndex * resolvedStepRem}rem`,
		"--skills-card-scale": scale,
		"--skills-card-rotate": "0deg",
		"--skills-card-z": "0px",
		filter: "blur(0px)",
		opacity: 1,
		pointerEvents: "none",
		top: `${topRem}rem`,
		width: `calc(${widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex: usableCardCount - cardIndex,
	} as CSSProperties;
}

export function getSkillsColumnCardStyle(
	cardIndex: number,
	totalCards: number,
	columnInsetRem: number,
): CSSProperties {
	const usableCardCount = Math.max(totalCards, 1);
	const availableTravelRem = Math.max(
		0,
		SKILLS_STACK.viewportHeightRem -
			SKILLS_STACK.cardHeightRem -
			columnInsetRem * 2,
	);
	const stepRem =
		usableCardCount === 1 ? 0 : availableTravelRem / (usableCardCount - 1);

	return {
		"--skills-card-y": `${cardIndex * stepRem}rem`,
		"--skills-card-scale": 1,
		"--skills-card-rotate": "0deg",
		"--skills-card-z": "0px",
		filter: "blur(0px)",
		opacity: 1,
		pointerEvents: "none",
		top: `${columnInsetRem}rem`,
		width: `calc(100% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex: usableCardCount - cardIndex,
	} as CSSProperties;
}

function getSkillsPlaceholderName(rank: number) {
	if (rank <= 3) {
		return `Future pick ${rank}`;
	}
	if (rank <= 6) {
		return "Next contender";
	}
	return "Still forming";
}

function getSkillsPlaceholderMeta(rank: number) {
	if (rank <= 3) {
		return "Still warming up";
	}
	if (rank <= 6) {
		return "Waiting for repeat use";
	}
	return "One more run to get there";
}

function getSkillsPlaceholderItem(rank: number): WrappedSkillUsageItem {
	return {
		count: 0,
		name: `placeholder-${rank}`,
	};
}
