import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface WrappedProgressItem {
	ariaLabel?: string;
	id: string;
	isActive: boolean;
	onSelect?: () => void;
}

export type WrappedProgressTransitionPhase =
	| "idle"
	| "pulse-to-card-resetting"
	| "pulse-to-card-activating";

interface WrappedProgressProps {
	ariaLabel: string;
	disabled?: boolean;
	items: readonly WrappedProgressItem[];
	rewardCardBackground?: string;
	transitionPhase?: WrappedProgressTransitionPhase;
}

const WRAPPED_PROGRESS_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_PROGRESS_LAYOUT_TRANSITION = {
	duration: 0.28,
	ease: WRAPPED_PROGRESS_EASE,
};
const WRAPPED_PROGRESS_STATE_TRANSITION = {
	duration: 0.24,
	ease: WRAPPED_PROGRESS_EASE,
};
const WRAPPED_PROGRESS_REWARD_CARD_PERSPECTIVE_PX = 17.6;

export function WrappedProgress(props: WrappedProgressProps) {
	const {
		ariaLabel,
		disabled = false,
		items,
		rewardCardBackground,
		transitionPhase = "idle",
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const isPulseToCardResetting = transitionPhase === "pulse-to-card-resetting";
	const isPulseToCardActivating =
		transitionPhase === "pulse-to-card-activating";

	return (
		<nav className="mymind-wrapped-progress" aria-label={ariaLabel}>
			{items.map((item) => {
				const isInteractive = !disabled && typeof item.onSelect === "function";
				const isRewardCard = item.id === "card";
				const isVisuallyActive = isPulseToCardResetting
					? false
					: isPulseToCardActivating
						? isRewardCard
						: item.isActive;
				const rewardCardStyle =
					isRewardCard && rewardCardBackground
						? ({
								"--wrapped-progress-reward-card-background":
									rewardCardBackground,
							} as CSSProperties)
						: undefined;

				return (
					<motion.button
						key={item.id}
						layout
						type="button"
						aria-current={isVisuallyActive ? "step" : undefined}
						aria-label={item.ariaLabel ?? item.id}
						disabled={!isInteractive}
						animate={{
							flexGrow: isRewardCard
								? isVisuallyActive
									? 0.9
									: 0.72
								: isVisuallyActive
									? 2.5
									: 0.62,
						}}
						className={cn(
							"mymind-wrapped-progress__button",
							isRewardCard ? "mymind-wrapped-progress__button--reward" : null,
							isVisuallyActive
								? "mymind-wrapped-progress__button--active"
								: "mymind-wrapped-progress__button--inactive",
						)}
						initial={false}
						onClick={item.onSelect}
						transition={WRAPPED_PROGRESS_LAYOUT_TRANSITION}
					>
						{isRewardCard ? (
							<motion.span
								aria-hidden="true"
								animate={
									reduceMotion
										? {
												transformPerspective:
													WRAPPED_PROGRESS_REWARD_CARD_PERSPECTIVE_PX,
												opacity: isVisuallyActive ? 0.92 : 0.62,
												scale: isVisuallyActive ? 1.02 : 0.97,
												x: isVisuallyActive ? -1.28 : -0.96,
												y: isVisuallyActive ? -0.32 : 0,
											}
										: {
												transformPerspective:
													WRAPPED_PROGRESS_REWARD_CARD_PERSPECTIVE_PX,
												filter: isVisuallyActive ? "blur(0px)" : "blur(0.8px)",
												opacity: isVisuallyActive ? 0.92 : 0.62,
												scale: isVisuallyActive ? 1.02 : 0.97,
												x: isVisuallyActive ? -1.28 : -0.96,
												y: isVisuallyActive ? -0.32 : 0,
												rotateX: isVisuallyActive ? 14 : 8,
												rotateY: isVisuallyActive ? -12 : -7,
												rotateZ: isVisuallyActive ? -4.5 : -3,
											}
								}
								initial={false}
								style={rewardCardStyle}
								className={cn(
									"mymind-wrapped-progress__reward-card",
									isVisuallyActive
										? "mymind-wrapped-progress__reward-card--active"
										: "mymind-wrapped-progress__reward-card--inactive",
								)}
								transition={WRAPPED_PROGRESS_STATE_TRANSITION}
							>
								<motion.span
									aria-hidden="true"
									animate={{
										opacity: isPulseToCardResetting || isVisuallyActive ? 0 : 1,
									}}
									className="mymind-wrapped-progress__reward-card-surface mymind-wrapped-progress__reward-card-surface--dark"
									initial={false}
									transition={WRAPPED_PROGRESS_STATE_TRANSITION}
								/>
								<motion.span
									aria-hidden="true"
									animate={{ opacity: isVisuallyActive ? 1 : 0 }}
									className="mymind-wrapped-progress__reward-card-surface mymind-wrapped-progress__reward-card-surface--active"
									initial={false}
									transition={WRAPPED_PROGRESS_STATE_TRANSITION}
								/>
							</motion.span>
						) : (
							<motion.span
								aria-hidden="true"
								animate={
									reduceMotion
										? {
												opacity: isVisuallyActive ? 1 : 0.72,
												scaleX: isVisuallyActive ? 1 : 0.82,
												scaleY: isVisuallyActive ? 1 : 0.96,
											}
										: {
												filter: isVisuallyActive ? "blur(0px)" : "blur(0.8px)",
												opacity: isVisuallyActive ? 1 : 0.72,
												scaleX: isVisuallyActive ? 1 : 0.82,
												scaleY: isVisuallyActive ? 1 : 0.96,
											}
								}
								className={cn(
									"mymind-wrapped-progress__segment",
									isVisuallyActive
										? "mymind-wrapped-progress__segment--active"
										: "mymind-wrapped-progress__segment--inactive",
								)}
								initial={false}
								transition={WRAPPED_PROGRESS_STATE_TRANSITION}
							/>
						)}
					</motion.button>
				);
			})}
		</nav>
	);
}
