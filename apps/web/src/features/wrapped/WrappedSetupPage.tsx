import { ArrowLeft } from "lucide-react";
import { MotionConfig } from "motion/react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	CliSetupHint,
	type CliSetupStepId,
	cliSetupCommands,
} from "@/components/analytics/CliSetupHint";
import { WrappedRouteStageShell } from "./route-stage-shell";

interface WrappedSetupPageProps {
	completedStepIdsOverride?: readonly CliSetupStepId[];
	currentStepIdOverride?: CliSetupStepId | null;
	initialStepId?: CliSetupStepId;
}

export function WrappedSetupPage(props: WrappedSetupPageProps) {
	const { completedStepIdsOverride, currentStepIdOverride, initialStepId } =
		props;
	const navigate = useNavigate();
	const lastStepIndex = cliSetupCommands.length - 1;
	const initialStepIndex = getInitialStepIndex(initialStepId, lastStepIndex);
	const currentStepIndex = initialStepIndex;
	const derivedCurrentStepId =
		cliSetupCommands[Math.min(currentStepIndex, lastStepIndex)]?.id ??
		cliSetupCommands[0].id;
	const derivedCompletedStepIds = useMemo(
		() =>
			cliSetupCommands
				.slice(0, currentStepIndex)
				.map((step) => step.id) as CliSetupStepId[],
		[currentStepIndex],
	);
	const currentStepId =
		currentStepIdOverride === undefined
			? derivedCurrentStepId
			: currentStepIdOverride;
	const completedStepIds = completedStepIdsOverride ?? derivedCompletedStepIds;

	function handleBack() {
		const historyIndex =
			typeof window.history.state?.idx === "number"
				? window.history.state.idx
				: 0;

		if (historyIndex > 0) {
			navigate(-1);
			return;
		}

		navigate(appRoutes.dashboard());
	}

	return (
		<MotionConfig reducedMotion="user">
			<WrappedRouteStageShell
				leadingControl={
					<button
						type="button"
						aria-label="Go back"
						className="mymind-wrapped-back-button rounded-full transition-colors"
						onClick={handleBack}
					>
						<ArrowLeft className="size-4" />
					</button>
				}
				description="Start sending sessions to Rudel."
				progressStepId="desktop-ready"
				stage={
					<CliSetupHint
						completedStepIds={completedStepIds}
						currentStepId={currentStepId}
						variant="wrapped-story"
					/>
				}
				title="Set up Rudel"
			/>
		</MotionConfig>
	);
}

function getInitialStepIndex(
	initialStepId: CliSetupStepId | undefined,
	lastStepIndex: number,
) {
	if (!initialStepId) {
		return 0;
	}

	const stepIndex = cliSetupCommands.findIndex(
		(step) => step.id === initialStepId,
	);
	if (stepIndex < 0) {
		return 0;
	}

	return Math.min(stepIndex, lastStepIndex);
}
