import type { ReactNode } from "react";
import { WrappedRouteStageShell } from "./route-stage-shell";

interface WrappedDesktopResumePromptStageProps {
	description: ReactNode;
	feedback?: ReactNode;
	primaryAction: ReactNode;
}

export function WrappedDesktopResumePromptStage(
	props: WrappedDesktopResumePromptStageProps,
) {
	const { description, feedback, primaryAction } = props;

	return (
		<WrappedRouteStageShell
			description={description}
			stageClassName="mymind-wrapped-entry-stage--mobile-handoff mymind-wrapped-entry-stage--desktop-resume-prompt"
			progressStepId="desktop-ready"
			stage={
				<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--prompt-shellless">
					<div className="mymind-wrapped-action-stack">
						{primaryAction}
						{feedback}
					</div>
				</div>
			}
			title="Continue setup on desktop"
			titleClassName="max-w-[11ch]"
		/>
	);
}
