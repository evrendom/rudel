import { motion } from "motion/react";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

const INTRO_EXIT = {
	distance: 72,
	duration: 0.24,
	lineDelay: 0.04,
	ease: [0.22, 1, 0.36, 1] as const,
};

interface IntroStageProps {
	displayName: string;
	isExiting: boolean;
}

export function WrappedOnboardingIntroStage(props: IntroStageProps) {
	const { displayName, isExiting } = props;
	const greetingName = getGreetingName(displayName);

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-intro-stage"
			copy={
				<motion.div
					animate={
						isExiting
							? {
									filter: "blur(10px)",
									opacity: 0,
									x: -INTRO_EXIT.distance,
								}
							: { filter: "blur(0px)", opacity: 1, x: 0 }
					}
					initial={false}
					transition={
						isExiting
							? {
									duration: INTRO_EXIT.duration,
									ease: INTRO_EXIT.ease,
								}
							: { duration: 0 }
					}
				>
					<WrappedOnboardingStageCopy
						entrancePreset="story"
						eyebrow={greetingName}
						title="Ready to see what your sessions say about you?"
						titleClassName="mymind-wrapped-stage-copy__headline--intro"
						description="Claude Code and Codex, pulled into one story."
					/>
				</motion.div>
			}
		/>
	);
}

function getGreetingName(displayName: string) {
	const trimmedDisplayName = displayName.trim();

	if (!trimmedDisplayName) {
		return undefined;
	}

	return trimmedDisplayName.split(/\s+/)[0] ?? trimmedDisplayName;
}
