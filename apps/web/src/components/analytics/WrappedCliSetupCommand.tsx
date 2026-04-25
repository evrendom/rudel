import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { WrappedSetupCommandSurface } from "@/components/analytics/CliSetupCommandSurface";

type CommandVisualState = "complete" | "current" | "upcoming" | "idle";

const WRAPPED_SETUP_MOTION = {
	baseDelay: 0.24,
	delay: 0.06,
	duration: 0.24,
	ease: [0.22, 1, 0.36, 1] as const,
};
const WRAPPED_SETUP_CARD_RADIUS = "0.82rem";

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
	const shouldOverlayAlternateCommand =
		shouldShowAlternateCommand && index === 1;
	const alternatePanelTransition = reduceMotion
		? {
				duration: 0.14,
				ease: "linear" as const,
			}
		: {
				duration: 0.2,
				ease: WRAPPED_SETUP_MOTION.ease,
			};

	return (
		<motion.li
			layout="position"
			initial={
				reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 16 }
			}
			animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
			transition={{
				delay:
					WRAPPED_SETUP_MOTION.baseDelay + index * WRAPPED_SETUP_MOTION.delay,
				duration: reduceMotion ? 0.16 : WRAPPED_SETUP_MOTION.duration,
				ease: WRAPPED_SETUP_MOTION.ease,
			}}
			className="list-none"
		>
			<motion.div
				layout="position"
				animate={getCommandMotionState({
					reduceMotion,
					visualState,
				})}
				className="mymind-wrapped-setup-command"
				data-step-state={visualState}
				data-overlay-expanded={
					shouldOverlayAlternateCommand && isAlternateCommandVisible
						? "true"
						: "false"
				}
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
						<div
							className="mymind-wrapped-setup-command__alternate-region"
							data-overlay={shouldOverlayAlternateCommand ? "true" : "false"}
						>
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
							<AnimatePresence initial={false}>
								{isAlternateCommandVisible ? (
									<motion.div
										key="alternate-command"
										animate={
											reduceMotion
												? { opacity: 1 }
												: shouldOverlayAlternateCommand
													? {
															opacity: 1,
															scale: 1,
															y: 0,
															borderTopLeftRadius: "0rem",
															borderTopRightRadius: "0rem",
															borderBottomLeftRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderBottomRightRadius:
																WRAPPED_SETUP_CARD_RADIUS,
														}
													: { opacity: 1, scale: 1, y: 0 }
										}
										className="mymind-wrapped-setup-command__alternate-panel"
										exit={
											reduceMotion
												? { opacity: 0 }
												: shouldOverlayAlternateCommand
													? {
															opacity: 0,
															scale: 0.99,
															y: -6,
															borderTopLeftRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderTopRightRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderBottomLeftRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderBottomRightRadius:
																WRAPPED_SETUP_CARD_RADIUS,
														}
													: { opacity: 0, scale: 0.99, y: -6 }
										}
										initial={
											reduceMotion
												? { opacity: 0 }
												: shouldOverlayAlternateCommand
													? {
															opacity: 0,
															scale: 0.99,
															y: -8,
															borderTopLeftRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderTopRightRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderBottomLeftRadius: WRAPPED_SETUP_CARD_RADIUS,
															borderBottomRightRadius:
																WRAPPED_SETUP_CARD_RADIUS,
														}
													: { opacity: 0, scale: 0.99, y: -8 }
										}
										transition={alternatePanelTransition}
									>
										<div className="mymind-wrapped-setup-command__alternate-panel-inner">
											<WrappedSetupCommandSurface
												caption={alternateCommandCaption}
												className="mymind-wrapped-setup-command__alternate-surface"
												command={alternateCommand}
												forceShell={alternateCommandCaption === undefined}
											/>
										</div>
									</motion.div>
								) : null}
							</AnimatePresence>
						</div>
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
		visualState === "complete"
			? 0.68
			: visualState === "upcoming"
				? 0.55
				: visualState === "idle"
					? 0.72
					: 1;

	if (reduceMotion) {
		return { opacity };
	}

	return {
		opacity,
		scale:
			visualState === "current"
				? 1
				: visualState === "complete"
					? 0.965
					: 0.985,
		y: visualState === "current" ? -2 : 0,
	};
}
