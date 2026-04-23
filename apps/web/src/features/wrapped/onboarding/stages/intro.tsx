import { motion } from "motion/react";

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
		<section className="mymind-wrapped-intro-stage">
			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								x: -INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				className="mymind-wrapped-intro-stage__hero"
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
				<p className="mymind-wrapped-intro-stage__eyebrow">{`Hey, ${greetingName}.`}</p>
				<h2 className="mymind-wrapped-intro-stage__headline">
					Ready to see what your sessions say about you?
				</h2>
				<p className="mymind-wrapped-intro-stage__subline">
					Claude Code and Codex, pulled into one story.
				</p>
			</motion.div>
		</section>
	);
}

function getGreetingName(displayName: string) {
	const trimmedDisplayName = displayName.trim();

	if (!trimmedDisplayName) {
		return "there";
	}

	return trimmedDisplayName.split(/\s+/)[0] ?? trimmedDisplayName;
}
