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
				description={
					<>
						{typeof description === "string" ? (
							<p>{description}</p>
						) : (
							description
						)}
						{debugControls ? (
							<WrappedDebugControlStack>
								{debugControls}
							</WrappedDebugControlStack>
						) : null}
					</>
				}
				entrancePreset="setup"
				stageClassName="rudel-wrapped-entry-stage--mobile-handoff rudel-wrapped-entry-stage--desktop-resume-prompt"
				progressStepId="desktop-ready"
				stage={
					<div className="rudel-wrapped-entry-card rudel-wrapped-entry-card--prompt-shellless">
						<div className="rudel-wrapped-action-stack">
							{primaryAction}
							{feedback}
						</div>
					</div>
				}
				title={
					<span className="rudel-wrapped-mobile-handoff-title">
						<Monitor
							aria-hidden="true"
							className="rudel-wrapped-mobile-handoff-title__icon"
						/>
						<span className="rudel-wrapped-mobile-handoff-title__label">
							Continue setup on desktop
						</span>
					</span>
				}
				titleClassName="rudel-wrapped-entry-stage__headline--desktop-handoff"
			/>
		</MotionConfig>
	);
}
