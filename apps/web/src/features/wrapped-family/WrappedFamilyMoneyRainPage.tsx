import {
	useWrappedFamilyMoneyRainData,
	type WrappedFamilyMoneyRainStory,
} from "@/features/wrapped-family/useWrappedFamilyMoneyRainData";
import { WrappedFamilyMoneyRainScene } from "@/features/wrapped-family/WrappedFamilyMoneyRainScene";
import "@/features/wrapped-family/wrapped-family-money-rain.css";

const LOADING_PREVIEW_STORY: WrappedFamilyMoneyRainStory = {
	ballCount: 18,
	displayBallCount: 18,
	displayName: "Operator",
	favoriteModel: "Syncing",
	firstName: "Operator",
	hasPartialBall: false,
	periodEnd: "",
	periodLabel: "Syncing live analytics",
	periodStart: "",
	remainderTokens: 0,
	representedTokens: 18000,
	totalCost: 0,
	totalTokens: 18000,
};

export function WrappedFamilyMoneyRainPage() {
	const { error, isError, isLoading, story } = useWrappedFamilyMoneyRainData();

	if (isLoading) {
		return (
			<WrappedFamilyMoneyRainScene isPreview story={LOADING_PREVIEW_STORY} />
		);
	}

	if (isError || !story) {
		return (
			<div className="wmr-screen">
				<div className="wmr-screen__status-card">
					<p className="wmr-screen__status-eyebrow">Wrapped · Money Rain</p>
					<h1 className="wmr-screen__status-title">Rain check</h1>
					<p className="wmr-screen__status-copy">
						{error instanceof Error && error.message.trim().length > 0
							? error.message
							: "The route is wired, but the token payload did not resolve cleanly in this environment."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<WrappedFamilyMoneyRainScene
			key={`${story.periodEnd}-${story.totalTokens}`}
			story={story}
		/>
	);
}
