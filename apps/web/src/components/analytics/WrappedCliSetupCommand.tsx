import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { WrappedSetupCommandSurface } from "@/components/analytics/CliSetupCommandSurface";

type CommandVisualState = "complete" | "current" | "upcoming" | "idle";

const WRAPPED_SETUP_MOTION = {
	delay: 0.06,
	duration: 0.24,
	ease: [0.22, 1, 0.36, 1] as const,
};

interface WrappedCliSetupCommandProps {
	alternateCommand?: string;
	alternateCommandCaption?: string;
	command: string;
	commandCaption?: string;
	description?: string;
	index: number;
	isActive?: boolean;
	isComplete?: boolean;
	isUpcoming?: boolean;
	label: string;
}

export function WrappedCliSetupCommand(props: WrappedCliSetupCommandProps) {
	const {
		alternateCommand,
		alternateCommandCaption,
		command,
		commandCaption,
		description,
		index,
		isActive = false,
		isComplete = false,
		isUpcoming = false,
		label,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [isAlternateCommandVisible, setIsAlternateCommandVisible] =
		useState(false);
	const visualState: CommandVisualState = isComplete
		? "complete"
		: isActive
			? "current"
			: isUpcoming
				? "upcoming"
				: "idle";
	const shouldShowAlternateCommand =
		(visualState === "current" || visualState === "upcoming") &&
		alternateCommand !== undefined;

	return (
		<motion.li
			layout
			initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				delay: index * WRAPPED_SETUP_MOTION.delay,
				duration: reduceMotion ? 0.16 : WRAPPED_SETUP_MOTION.duration,
				ease: WRAPPED_SETUP_MOTION.ease,
			}}
			className="list-none"
		>
			<motion.div
				layout
				animate={getCommandMotionState({
					reduceMotion,
					visualState,
				})}
				className="mymind-wrapped-setup-command"
				data-step-state={visualState}
				initial={false}
				transition={{
					duration: reduceMotion ? 0.16 : 0.2,
					ease: WRAPPED_SETUP_MOTION.ease,
				}}
			>
				<div className="mymind-wrapped-setup-command__meta">
					<div className="mymind-wrapped-setup-command__heading">
						<span className="mymind-wrapped-setup-command__index">
							{String(index + 1).padStart(2, "0")}
						</span>
						<div className="mymind-wrapped-setup-command__label-row">
							<p className="mymind-wrapped-setup-command__label">{label}</p>
							{isComplete ? (
								<span
									aria-hidden="true"
									className="mymind-wrapped-setup-command__check-badge"
								>
									<Check
										strokeWidth={3}
										className="mymind-wrapped-setup-command__check"
									/>
								</span>
							) : null}
						</div>
					</div>
				</div>
				{description ? (
					<p className="mymind-wrapped-setup-command__description">
						{description}
					</p>
				) : null}
				<div className="mymind-wrapped-setup-command__actions">
					<WrappedSetupCommandSurface
						caption={commandCaption}
						command={command}
					/>
					{shouldShowAlternateCommand ? (
						<>
							<button
								type="button"
								className="mymind-wrapped-setup-command__alternate-toggle"
								aria-expanded={isAlternateCommandVisible}
								onClick={() =>
									setIsAlternateCommandVisible((currentValue) => !currentValue)
								}
							>
								<span
									className="mymind-wrapped-setup-command__alternate-toggle-arrow"
									aria-hidden="true"
									data-expanded={isAlternateCommandVisible ? "true" : "false"}
								>
									▸
								</span>
								<span>
									Don&apos;t want to auto-upload but manually pick single
									sessions?
								</span>
							</button>
							{isAlternateCommandVisible ? (
								<WrappedSetupCommandSurface
									caption={alternateCommandCaption}
									command={alternateCommand}
								/>
							) : null}
						</>
					) : null}
				</div>
			</motion.div>
		</motion.li>
	);
}

function getCommandMotionState(props: {
	reduceMotion: boolean;
	visualState: CommandVisualState;
}) {
	const { reduceMotion, visualState } = props;
	const opacity =
		visualState === "upcoming" ? 0.55 : visualState === "idle" ? 0.72 : 1;

	if (reduceMotion) {
		return { opacity };
	}

	return {
		opacity,
		scale: visualState === "current" ? 1 : 0.985,
		y: visualState === "current" ? -2 : 0,
	};
}
