import type { CSSProperties } from "react";
import { formatPercent } from "../format";
import type { WrappedSkillUsageItem } from "../types";
import {
	hasWrappedRecapFeatureSignal,
	MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE,
} from "./feature-signal";

export const SKILLS_STACK = {
	cardHeightRem: 5.5,
	columnInsetRem: 0.45,
	focusTopRem: 4.65,
	shadowBleedRem: 1,
	stepRem: 2.95,
	viewportHeightRem: 16.2,
	visibleCards: 3,
} as const;

interface SkillsDepthStyle {
	rotateDeg: number;
	scale: number;
	translateZ: number;
	widthPercent: number;
}

function getSkillsStackWidthPercent(cardIndex: number) {
	if (cardIndex <= 0) {
		return 100;
	}

	if (cardIndex === 1) {
		return 96;
	}

	if (cardIndex === 2) {
		return 92;
	}

	return 88;
}

function getSkillsDeckDepthStyle(depth: number): SkillsDepthStyle {
	if (depth <= 0) {
		return { rotateDeg: 0, scale: 1, translateZ: 52, widthPercent: 100 };
	}

	if (depth === 1) {
		return { rotateDeg: 8, scale: 0.962, translateZ: 16, widthPercent: 96 };
	}

	if (depth === 2) {
		return { rotateDeg: 12, scale: 0.93, translateZ: -4, widthPercent: 92 };
	}

	return { rotateDeg: 12, scale: 0.93, translateZ: -4, widthPercent: 88 };
}

interface SkillsCollapsedCardStyleInput {
	cardIndex: number;
	collapsedScaleStep: number;
	collapsedStepRem: number;
	totalCards: number;
	topRem: number;
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
	const signalSkills = input.topSkills.filter(
		(skill) => skill.name.trim().length > 0 && skill.count > 0,
	);
	const hasSkillsSignal = hasWrappedRecapFeatureSignal({
		adoptionRate: input.skillsAdoptionRate,
		topItemCount: signalSkills[0]?.count ?? null,
	});
	const rankedSkills = hasSkillsSignal ? signalSkills : [];
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
		const hasLowSkillUsage = signalSkills.length > 0;

		return {
			cards,
			emptyState: hasLowSkillUsage ? "low-signal" : "no-signal",
			footnote: "",
			hasRankedSkills: false,
			headline: hasLowSkillUsage
				? "You didn't use skills enough."
				: "You've got a skill issue.",
			isScrollable,
			subline: hasLowSkillUsage
				? `Use skills in ${MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE}%+ of sessions for a recap.`
				: "",
			trackHeightRem,
		};
	}

	if (rankedSkills.length === 1) {
		return {
			cards,
			emptyState: null,
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
		emptyState: null,
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
	return getSkillsDeckCardStyle({
		activeCardIndex,
		cardIndex,
		yRem: (cardIndex - activeCardIndex) * SKILLS_STACK.stepRem,
	});
}

export function getSkillsScrollableCardStyle(
	cardIndex: number,
	activeCardIndex: number,
): CSSProperties {
	return getSkillsDeckCardStyle({
		activeCardIndex,
		cardIndex,
		yRem: cardIndex * SKILLS_STACK.stepRem,
	});
}

function getSkillsDeckCardStyle(input: {
	activeCardIndex: number;
	cardIndex: number;
	yRem: number;
}): CSSProperties {
	const { activeCardIndex, cardIndex, yRem } = input;
	const relativeDepth = cardIndex - activeCardIndex;
	const isLeadingStack = activeCardIndex === 0;
	const isVisibleDepth = isLeadingStack
		? relativeDepth >= 0 && relativeDepth < SKILLS_STACK.visibleCards
		: relativeDepth >= -1 && relativeDepth < SKILLS_STACK.visibleCards - 1;
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
			: getSkillsDeckDepthStyle(relativeDepth);

	return {
		"--skills-card-y": `${yRem}rem`,
		"--skills-card-scale": depthStyles.scale,
		"--skills-card-rotate": `${depthStyles.rotateDeg}deg`,
		"--skills-card-z": `${depthStyles.translateZ}px`,
		filter:
			isVisibleDepth && relativeDepth === 2
				? "blur(0.8px)"
				: isVisibleDepth
					? "blur(0px)"
					: "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: isVisibleDepth ? "auto" : "none",
		top: `${SKILLS_STACK.focusTopRem}rem`,
		width: `calc(${depthStyles.widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex,
	} as CSSProperties;
}

export function getSkillsDealCardStyle(
	cardIndex: number,
	revealedCardCount: number,
): CSSProperties {
	const visibleCardLimit = Math.min(
		SKILLS_STACK.visibleCards,
		revealedCardCount,
	);
	const firstRevealedCardIndex = Math.max(
		0,
		SKILLS_STACK.visibleCards - visibleCardLimit,
	);
	const isRevealedCard =
		cardIndex >= firstRevealedCardIndex &&
		cardIndex < SKILLS_STACK.visibleCards;

	if (!isRevealedCard) {
		return {
			filter: "blur(6px)",
			opacity: 0,
			pointerEvents: "none",
			top: `${SKILLS_STACK.focusTopRem}rem`,
			transformOrigin: "center top",
			width: `calc(100% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
			zIndex: 1,
		} as CSSProperties;
	}

	const frontCardIndex = firstRevealedCardIndex;
	const deckStyle = getSkillsCardStyle(cardIndex, frontCardIndex);

	return {
		...deckStyle,
		filter: deckStyle.filter ?? "blur(0px)",
		opacity: deckStyle.opacity ?? 1,
		pointerEvents: "none",
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
	} = input;
	const usableCardCount = Math.max(totalCards, 1);
	const introVisibleCards = 3;
	const introDepth = Math.min(cardIndex, introVisibleCards - 1);
	const isVisibleDepth = cardIndex < introVisibleCards;
	const widthPercent = getSkillsStackWidthPercent(cardIndex);
	const scale = Math.max(
		0.992,
		1 - cardIndex * Math.max(collapsedScaleStep, 0.004),
	);
	const xOffsetRem = cardIndex === 1 ? -0.22 : cardIndex === 2 ? 0.18 : 0;
	const rotateDeg = cardIndex === 1 ? -2.15 : cardIndex === 2 ? 1.85 : 0;
	const translateZ =
		cardIndex === 0 ? 42 : cardIndex === 1 ? 22 : cardIndex === 2 ? 8 : -6;

	return {
		"--skills-card-x": `${xOffsetRem}rem`,
		"--skills-card-y": `${introDepth * collapsedStepRem}rem`,
		"--skills-card-scale": scale,
		"--skills-card-spin": `${rotateDeg}deg`,
		"--skills-card-rotate": "0deg",
		"--skills-card-z": `${translateZ}px`,
		filter: isVisibleDepth ? "blur(0px)" : "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: "none",
		top: `${topRem}rem`,
		width: `calc(${widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex: usableCardCount - cardIndex,
	} as CSSProperties;
}

export function getSkillsColumnCardStyle(
	cardIndex: number,
	input: {
		scale: number;
		stepRem: number;
		topRem: number;
	},
): CSSProperties {
	const { scale, stepRem, topRem } = input;
	const introVisibleCards = 3;
	const introDepth = Math.min(cardIndex, introVisibleCards - 1);
	const isVisibleDepth = cardIndex < introVisibleCards;
	const widthPercent = getSkillsStackWidthPercent(cardIndex);
	const resolvedScale =
		cardIndex === 0 ? 1 : Math.max(0.994, scale - cardIndex * 0.002);
	const xOffsetRem = cardIndex === 1 ? -0.1 : cardIndex === 2 ? 0.08 : 0;
	const rotateDeg = cardIndex === 1 ? -0.75 : cardIndex === 2 ? 0.6 : 0;
	const translateZ =
		cardIndex === 0 ? 34 : cardIndex === 1 ? 18 : cardIndex === 2 ? 8 : -4;

	return {
		"--skills-card-x": `${xOffsetRem}rem`,
		"--skills-card-y": `${introDepth * stepRem}rem`,
		"--skills-card-scale": resolvedScale,
		"--skills-card-spin": `${rotateDeg}deg`,
		"--skills-card-rotate": "0deg",
		"--skills-card-z": `${translateZ}px`,
		filter: isVisibleDepth ? "blur(0px)" : "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: "none",
		top: `${topRem}rem`,
		width: `calc(${widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex: introVisibleCards - introDepth,
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
