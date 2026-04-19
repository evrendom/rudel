import { useMemo } from "react";
import { useWrappedFamilySpendData } from "@/features/wrapped-family/useWrappedFamilySpendData";

export type WrappedFamilyMoneyRainStory = {
	ballCount: number;
	displayName: string;
	displayBallCount: number;
	favoriteModel: string | null;
	firstName: string;
	hasPartialBall: boolean;
	periodEnd: string;
	periodLabel: string;
	periodStart: string;
	remainderTokens: number;
	representedTokens: number;
	totalCost: number;
	totalTokens: number;
};

type WrappedFamilyMoneyRainState = {
	error: unknown;
	isError: boolean;
	isLoading: boolean;
	story: WrappedFamilyMoneyRainStory | null;
};

function getBallCount(totalTokens: number) {
	return Math.floor(Math.max(0, totalTokens) / 1000);
}

export function useWrappedFamilyMoneyRainData(): WrappedFamilyMoneyRainState {
	const state = useWrappedFamilySpendData();

	return useMemo(() => {
		if (state.isLoading) {
			return {
				error: state.error,
				isError: false,
				isLoading: true,
				story: null,
			} satisfies WrappedFamilyMoneyRainState;
		}

		if (state.isError || !state.story) {
			return {
				error: state.error,
				isError: true,
				isLoading: false,
				story: null,
			} satisfies WrappedFamilyMoneyRainState;
		}

		const ballCount = getBallCount(state.story.totalTokens);
		const representedTokens = ballCount * 1000;
		const remainderTokens = Math.max(
			0,
			state.story.totalTokens - representedTokens,
		);
		const hasPartialBall = remainderTokens > 0;

		return {
			error: null,
			isError: false,
			isLoading: false,
			story: {
				ballCount,
				displayName: state.story.displayName,
				displayBallCount: ballCount + (hasPartialBall ? 1 : 0),
				favoriteModel: state.story.favoriteModel,
				firstName: state.story.firstName,
				hasPartialBall,
				periodEnd: state.story.periodEnd,
				periodLabel: state.story.periodLabel,
				periodStart: state.story.periodStart,
				remainderTokens,
				representedTokens,
				totalCost: state.story.totalCost,
				totalTokens: state.story.totalTokens,
			},
		} satisfies WrappedFamilyMoneyRainState;
	}, [state.error, state.isError, state.isLoading, state.story]);
}
