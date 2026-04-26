import { ChevronLeft, HelpCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { appRoutes } from "@/app/routes";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import { getWrappedOnboardingProgressView } from "@/features/wrapped/wrapped-onboarding-progress";
import { openChatwoot } from "@/lib/chatwoot";
import { cn } from "@/lib/utils";
import { WrappedMobileChatwootBubbleController } from "../mobile-chatwoot-bubble-controller";
import { WrappedDebugControlStack } from "../route-stage-shell";
import type {
	PreviewableWrappedStepId,
	WrappedPreviewOption,
	WrappedPrimaryStep,
} from "./config";
import { WRAPPED_SATURDAY_STEPS } from "./config";

const WRAPPED_SATURDAY_STEP_INDEX_BY_ID = new Map(
	WRAPPED_SATURDAY_STEPS.map((step, index) => [step.id, index]),
);

const WRAPPED_ONBOARDING_FOOTER_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_ONBOARDING_FOOTER_REDUCED_DURATION = 0.14;

interface WrappedOnboardingHeaderProps {
	activeStep: WrappedPrimaryStep;
	activeStepIndex: number;
	isStepTransitioning: boolean;
	onBack: () => void;
	onGoToStep: (nextStepIndex: number) => void;
	rewardCardBackground?: string;
}

interface WrappedOnboardingFooterProps {
	activeStep: WrappedPrimaryStep;
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	finalFooter?: ReactNode;
	generalDebugControls?: ReactNode;
	isContinueVisible?: boolean;
	isDebugControlsVisible: boolean;
	isStepTransitioning: boolean;
	onContinue: () => void;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
}

interface WrappedOnboardingDebugControlsProps {
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	activeStep: WrappedPrimaryStep;
	className?: string;
	generalDebugControls?: ReactNode;
	isDebugControlsVisible: boolean;
	isStepTransitioning: boolean;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
}

export function WrappedOnboardingHeader(props: WrappedOnboardingHeaderProps) {
	const {
		activeStep,
		activeStepIndex,
		isStepTransitioning,
		onBack,
		onGoToStep,
		rewardCardBackground,
	} = props;
	const progressView = getWrappedOnboardingProgressView(activeStep.id);

	return (
		<>
			<WrappedMobileChatwootBubbleController />
			<header className="mymind-wrapped-top-tray">
				<div className="mymind-wrapped-top-tray__row">
					<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--start">
						{activeStepIndex > 0 ? (
							<button
								type="button"
								aria-label="Go back"
								disabled={isStepTransitioning}
								className="mymind-wrapped-top-tray__edge-control"
								onClick={() => onGoToStep(activeStepIndex - 1)}
							>
								<ChevronLeft className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--back" />
							</button>
						) : (
							<button
								type="button"
								aria-label="Go back"
								className="mymind-wrapped-top-tray__edge-control"
								onClick={onBack}
							>
								<ChevronLeft className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--back" />
							</button>
						)}
					</div>

					<div className="mymind-wrapped-top-tray__center">
						<WrappedProgress
							ariaLabel="Wrapped onboarding progress"
							disabled={isStepTransitioning}
							items={progressView.items.map((item) => {
								const routeIndex = getWrappedSaturdayRouteIndex(item.id);

								return {
									ariaLabel: `Go to onboarding step ${item.stepNumber}: ${item.label}`,
									id: item.id,
									isActive: item.isActive,
									onSelect:
										routeIndex >= 0 ? () => onGoToStep(routeIndex) : undefined,
								};
							})}
							rewardCardBackground={rewardCardBackground}
						/>
					</div>

					<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--end">
						<button
							type="button"
							aria-label="Open support"
							className="mymind-wrapped-top-tray__edge-control"
							onClick={() => void openChatwoot()}
						>
							<HelpCircle className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--help" />
						</button>
					</div>
				</div>
			</header>
		</>
	);
}

export function WrappedOnboardingDebugControls(
	props: WrappedOnboardingDebugControlsProps,
) {
	const {
		activePreviewOptions,
		activePreviewState,
		activePreviewStepId,
		activeStep,
		className,
		generalDebugControls,
		isDebugControlsVisible,
		isStepTransitioning,
		onPreviewStateChange,
	} = props;
	const isStoryDebugTrayVisible =
		isDebugControlsVisible && activePreviewStepId && activePreviewOptions;
	const hasDebugControls =
		Boolean(generalDebugControls) || isStoryDebugTrayVisible;

	if (!hasDebugControls) {
		return null;
	}

	const controls = (
		<WrappedDebugControlStack>
			{generalDebugControls}
			{isStoryDebugTrayVisible ? (
				<WrappedOnboardingDebugTray
					activePreviewOptions={activePreviewOptions}
					activePreviewState={activePreviewState}
					activePreviewStepId={activePreviewStepId}
					activeStep={activeStep}
					isStepTransitioning={isStepTransitioning}
					onPreviewStateChange={onPreviewStateChange}
				/>
			) : null}
		</WrappedDebugControlStack>
	);

	return className ? <div className={className}>{controls}</div> : controls;
}

export function WrappedOnboardingFooter(props: WrappedOnboardingFooterProps) {
	const {
		activePreviewOptions,
		activePreviewState,
		activePreviewStepId,
		activeStep,
		finalFooter,
		generalDebugControls,
		isContinueVisible = true,
		isDebugControlsVisible,
		isStepTransitioning,
		onContinue,
		onPreviewStateChange,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const shouldReserveActionSlot =
		activeStep.kind !== "final" && activeStep.id === "model";
	const isFooterActionVisible =
		activeStep.kind === "final" ? finalFooter !== false : isContinueVisible;
	const shouldRenderFooterActionSlot =
		isFooterActionVisible || shouldReserveActionSlot;
	const continueLabel =
		activeStep.id === "pulse" ? "Reveal my card" : "Continue";
	const footerActionKey =
		activeStep.kind === "final"
			? "final"
			: `${activeStep.id}:${isContinueVisible ? "visible" : "hidden"}`;

	return (
		<footer className="mymind-wrapped-dock">
			<WrappedOnboardingDebugControls
				activePreviewOptions={activePreviewOptions}
				activePreviewState={activePreviewState}
				activePreviewStepId={activePreviewStepId}
				activeStep={activeStep}
				generalDebugControls={generalDebugControls}
				isDebugControlsVisible={isDebugControlsVisible}
				isStepTransitioning={isStepTransitioning}
				onPreviewStateChange={onPreviewStateChange}
			/>

			<AnimatePresence mode="wait">
				{shouldRenderFooterActionSlot ? (
					<motion.div
						key={footerActionKey}
						animate={
							isFooterActionVisible
								? reduceMotion
									? { opacity: 1 }
									: { filter: "blur(0px)", opacity: 1, y: 0 }
								: reduceMotion
									? { opacity: 0 }
									: { filter: "blur(8px)", opacity: 0, y: 0 }
						}
						className={cn(
							"w-full",
							shouldReserveActionSlot && !isFooterActionVisible
								? "mymind-wrapped-dock__action-slot--hidden"
								: null,
						)}
						exit={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(8px)", opacity: 0, y: 8 }
						}
						initial={
							shouldReserveActionSlot && !isFooterActionVisible
								? false
								: reduceMotion
									? { opacity: 0 }
									: { filter: "blur(10px)", opacity: 0, y: 12 }
						}
						transition={
							reduceMotion
								? {
										duration: WRAPPED_ONBOARDING_FOOTER_REDUCED_DURATION,
										ease: "linear",
									}
								: {
										duration: 0.26,
										ease: WRAPPED_ONBOARDING_FOOTER_EASE,
									}
						}
					>
						{activeStep.kind === "final" ? (
							(finalFooter ?? (
								<WrappedPrimaryAction kind="link" to={appRoutes.dashboard()}>
									Done
								</WrappedPrimaryAction>
							))
						) : (
							<WrappedPrimaryAction
								kind="button"
								disabled={
									isStepTransitioning ||
									(shouldReserveActionSlot && !isFooterActionVisible)
								}
								onClick={onContinue}
							>
								{continueLabel}
							</WrappedPrimaryAction>
						)}
					</motion.div>
				) : null}
			</AnimatePresence>
		</footer>
	);
}

function WrappedOnboardingDebugTray(props: {
	activePreviewOptions: readonly WrappedPreviewOption[];
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId;
	activeStep: WrappedPrimaryStep;
	isStepTransitioning: boolean;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
}) {
	const {
		activePreviewOptions,
		activePreviewState,
		activePreviewStepId,
		activeStep,
		isStepTransitioning,
		onPreviewStateChange,
	} = props;

	return (
		<div className="mymind-wrapped-debug-tray">
			<div className="mymind-wrapped-debug-tray__scroller">
				<fieldset className="mymind-wrapped-debug-tray__options">
					<legend className="sr-only">{`${activeStep.label} preview states`}</legend>
					{activePreviewOptions.map((option) => {
						const isSelected = option.value === activePreviewState;
						const [primaryLine, secondaryLine] = splitWrappedDebugLabel(
							option.label,
						);

						return (
							<button
								key={option.value}
								type="button"
								aria-pressed={isSelected}
								disabled={isStepTransitioning}
								onClick={() =>
									onPreviewStateChange(activePreviewStepId, option.value)
								}
								className={cn(
									"mymind-wrapped-debug-tray__option",
									isSelected
										? "mymind-wrapped-debug-tray__option--active"
										: "mymind-wrapped-debug-tray__option--inactive",
								)}
							>
								<span className="mymind-wrapped-debug-tray__option-label">
									<span>{primaryLine}</span>
									{secondaryLine ? <span>{secondaryLine}</span> : null}
								</span>
							</button>
						);
					})}
				</fieldset>
			</div>
		</div>
	);
}

function getWrappedSaturdayRouteIndex(stepId: string) {
	return (
		WRAPPED_SATURDAY_STEP_INDEX_BY_ID.get(
			stepId as (typeof WRAPPED_SATURDAY_STEPS)[number]["id"],
		) ?? -1
	);
}

function splitWrappedDebugLabel(label: string): [string, string?] {
	if (label.includes(" (") && label.endsWith(")")) {
		const [head, tail] = label.split(" (");

		return [head.trim(), tail.replace(/\)$/, "").trim()];
	}

	if (label.includes(",")) {
		const [head, ...rest] = label.split(",");

		return [head.trim(), rest.join(",").trim()];
	}

	const words = label.trim().split(/\s+/);

	if (words.length <= 1) {
		return [label];
	}

	if (words.length === 2) {
		return [words[0] ?? label, words[1]];
	}

	const midpoint = Math.ceil(words.length / 2);
	const primaryLine = words.slice(0, midpoint).join(" ");
	const secondaryLine = words.slice(midpoint).join(" ");

	return [primaryLine, secondaryLine];
}
