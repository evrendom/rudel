import { Monitor } from "lucide-react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";

interface WrappedDesktopResumePromptStageProps {
	description: ReactNode;
	debugControls?: ReactNode;
	feedback?: ReactNode;
	primaryAction: ReactNode;
}

export function WrappedDesktopResumePromptStage(
	props: WrappedDesktopResumePromptStageProps,
) {
	const { description, debugControls, feedback, primaryAction } = props;

	return (
		<MotionConfig reducedMotion="user">
			<WrappedRouteStageShell
				description={description}
				entrancePreset="setup"
				stageClassName="mymind-wrapped-entry-stage--mobile-handoff mymind-wrapped-entry-stage--desktop-resume-prompt"
				progressStepId="desktop-ready"
				stage={
					<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--prompt-shellless">
						<div className="mymind-wrapped-action-stack">
							{debugControls ? (
								<WrappedDebugControlStack>
									{debugControls}
								</WrappedDebugControlStack>
							) : null}
							{primaryAction}
							{feedback}
						</div>
					</div>
				}
				title={
					<span className="mymind-wrapped-mobile-handoff-title">
						<Monitor
							aria-hidden="true"
							className="mymind-wrapped-mobile-handoff-title__icon"
						/>
						<span className="mymind-wrapped-mobile-handoff-title__label">
							Continue setup on desktop
						</span>
					</span>
				}
				titleClassName="mymind-wrapped-entry-stage__headline--desktop-handoff"
			/>
		</MotionConfig>
	);
}
