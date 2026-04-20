import { useWrappedFamilySpendData } from "@/features/wrapped-family/useWrappedFamilySpendData";
import { WrappedFamilySpendScene } from "@/features/wrapped-family/WrappedFamilySpendScene";
import "@/features/wrapped-family/wrapped-family.css";

export function WrappedFamilyPage() {
	const { error, isError, isLoading, story } = useWrappedFamilySpendData();

	if (isLoading) {
		return (
			<div className="wf-spend-status-screen">
				<div className="wf-spend-status-card">
					<p className="wf-spend-status-eyebrow">{"Wrapped // Flight Mode"}</p>
					<h1 className="wf-spend-status-title">Loading spend story</h1>
					<p className="wf-spend-status-copy">
						Pulling your real analytics before the board lights up.
					</p>
				</div>
			</div>
		);
	}

	if (isError || !story) {
		return (
			<div className="wf-spend-status-screen">
				<div className="wf-spend-status-card">
					<p className="wf-spend-status-eyebrow">{"Wrapped // Flight Mode"}</p>
					<h1 className="wf-spend-status-title">Spend story unavailable</h1>
					<p className="wf-spend-status-copy">
						{error instanceof Error && error.message.trim().length > 0
							? error.message
							: "The route is wired, but the analytics payload did not resolve cleanly in this environment."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<WrappedFamilySpendScene
			key={`${story.periodEnd}-${story.totalCost}`}
			story={story}
		/>
	);
}
