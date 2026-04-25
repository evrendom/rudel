import { ChevronLeft, HelpCircle, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Children, isValidElement } from "react";
import { useNavigate } from "react-router-dom";
import {
	WrappedStageCopy,
	WrappedStageFrame,
} from "@/features/wrapped/stage-frame";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import {
	getWrappedOnboardingProgressView,
	type WrappedOnboardingProgressStepId,
} from "@/features/wrapped/wrapped-onboarding-progress";
import { openChatwoot } from "@/lib/chatwoot";
import { cn } from "@/lib/utils";
import "@/features/wrapped/wrapped.css";

interface WrappedRouteStageShellProps {
	backLabel?: string;
	description?: ReactNode;
	entrancePreset?: "none" | "setup";
	eyebrow?: ReactNode;
	footer?: ReactNode;
	footerDebugControls?: ReactNode;
	hideTopChromeControls?: boolean;
	leadingControl?: ReactNode | null;
	objectClassName?: string;
	onBack?: () => void;
	progressStepId?: WrappedOnboardingProgressStepId;
	status?: ReactNode;
	stageClassName?: string;
	stage: ReactNode;
	title: ReactNode;
	titleClassName?: string;
	useReferenceTopChrome?: boolean;
}

const WRAPPED_SETUP_ENTRANCE_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_SETUP_REDUCED_EASE = "linear" as const;

const WRAPPED_SETUP_ENTRANCE = {
	footer: {
		animate: { opacity: 1, y: 0 },
		initial: { opacity: 0, y: 8 },
		transition: {
			delay: 0.3,
			duration: 0.22,
			ease: WRAPPED_SETUP_ENTRANCE_EASE,
		},
	},
	footerReduced: {
		animate: { opacity: 1 },
		initial: { opacity: 0 },
		transition: {
			delay: 0.18,
			duration: 0.14,
			ease: WRAPPED_SETUP_REDUCED_EASE,
		},
	},
	stage: {
		animate: {
			opacity: [0, 1, 1] as number[],
			scale: [0.965, 1.002, 1] as number[],
			y: [22, -2, 0] as number[],
		},
		initial: { opacity: 0, scale: 0.965, y: 22 },
		transition: {
			delay: 0.18,
			duration: 0.48,
			ease: WRAPPED_SETUP_ENTRANCE_EASE,
			times: [0, 0.72, 1] as number[],
		},
	},
	stageReduced: {
		animate: { opacity: 1 },
		initial: { opacity: 0 },
		transition: {
			delay: 0.14,
			duration: 0.14,
			ease: WRAPPED_SETUP_REDUCED_EASE,
		},
	},
};

export function WrappedRouteStageShell(props: WrappedRouteStageShellProps) {
	const {
		backLabel = "Close wrapped",
		description,
		entrancePreset = "none",
		eyebrow,
		footer,
		footerDebugControls,
		hideTopChromeControls = false,
		leadingControl,
		objectClassName,
		onBack,
		progressStepId,
		stageClassName,
		stage,
		status,
		title,
		titleClassName,
		useReferenceTopChrome = false,
	} = props;
	const navigate = useNavigate();
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const progressView = progressStepId
		? getWrappedOnboardingProgressView(progressStepId)
		: null;
	const shouldUseReferenceTopChrome =
		useReferenceTopChrome || progressView !== null;
	const hasFooter = Boolean(footer) || Boolean(footerDebugControls);
	const shouldAnimateSetupEntrance = entrancePreset === "setup";
	const hasTextStatus =
		typeof status === "string" || typeof status === "number";
	const animatedCopy = (
		<WrappedStageCopy
			description={description}
			descriptionClassName="mymind-wrapped-entry-stage__subline"
			entrancePreset={shouldAnimateSetupEntrance ? "setup" : "none"}
			eyebrow={eyebrow}
			eyebrowClassName="mymind-wrapped-entry-stage__eyebrow"
			title={title}
			titleClassName={cn(
				"mymind-wrapped-entry-stage__headline",
				titleClassName,
			)}
		/>
	);
	const animatedStage = shouldAnimateSetupEntrance ? (
		<motion.div
			animate={
				reduceMotion
					? WRAPPED_SETUP_ENTRANCE.stageReduced.animate
					: WRAPPED_SETUP_ENTRANCE.stage.animate
			}
			className="grid w-full justify-items-center"
			initial={
				reduceMotion
					? WRAPPED_SETUP_ENTRANCE.stageReduced.initial
					: WRAPPED_SETUP_ENTRANCE.stage.initial
			}
			transition={
				reduceMotion
					? WRAPPED_SETUP_ENTRANCE.stageReduced.transition
					: WRAPPED_SETUP_ENTRANCE.stage.transition
			}
		>
			{stage}
		</motion.div>
	) : (
		stage
	);
	const stageFrame = (
		<WrappedStageFrame
			className={cn("mymind-wrapped-entry-stage", stageClassName)}
			copy={animatedCopy}
			copyClassName="mymind-wrapped-entry-stage__copy"
			object={animatedStage}
			objectClassName={cn(
				"mymind-wrapped-entry-stage__object",
				objectClassName,
			)}
		/>
	);

	function handleDefaultBack() {
		const historyIndex =
			typeof window.history.state?.idx === "number"
				? window.history.state.idx
				: 0;

		if (historyIndex > 0) {
			navigate(-1);
		}
	}

	const handleBack = onBack ?? handleDefaultBack;

	return (
		<main className="mymind-wrapped-route mymind-wrapped-route--onboarding">
			<div
				className={cn(
					"mymind-wrapped-shell relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground",
					shouldUseReferenceTopChrome
						? "mymind-wrapped-shell--reference-top-chrome"
						: null,
				)}
			>
				<div
					className={cn(
						"mymind-wrapped-shell__frame",
						!hasFooter ? "mymind-wrapped-shell__frame--no-footer" : null,
					)}
				>
					<header className="mymind-wrapped-top-tray">
						{/* Keep the top chrome static on setup: the back button, progress bar,
						    and help button should anchor the screen instead of joining the entrance motion. */}
						<div className="mymind-wrapped-top-tray__row">
							<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--start">
								{hideTopChromeControls ? (
									<span
										aria-hidden="true"
										className="mymind-wrapped-top-tray__utility-placeholder"
									/>
								) : leadingControl !== undefined ? (
									leadingControl
								) : (
									<button
										type="button"
										aria-label={backLabel}
										className={cn(
											shouldUseReferenceTopChrome
												? "mymind-wrapped-top-tray__edge-control"
												: "mymind-wrapped-back-button rounded-full transition-colors",
										)}
										onClick={handleBack}
									>
										{shouldUseReferenceTopChrome ? (
											<ChevronLeft className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--back" />
										) : (
											<X className="size-4" />
										)}
									</button>
								)}
							</div>

							<div className="mymind-wrapped-top-tray__center">
								{hideTopChromeControls ? null : progressView ? (
									<WrappedProgress
										ariaLabel="Wrapped onboarding progress"
										items={progressView.items.map((item) => ({
											ariaLabel: `Onboarding step ${item.stepNumber}: ${item.label}`,
											id: item.id,
											isActive: item.isActive,
										}))}
									/>
								) : status ? (
									hasTextStatus ? (
										<div className="mymind-wrapped-top-tray__status">
											{status}
										</div>
									) : (
										<div className="mymind-wrapped-top-tray__floating-control">
											{status}
										</div>
									)
								) : null}
							</div>

							<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--end">
								{hideTopChromeControls ? (
									<span
										aria-hidden="true"
										className="mymind-wrapped-top-tray__utility-placeholder"
									/>
								) : shouldUseReferenceTopChrome ? (
									<button
										type="button"
										aria-label="Open support"
										className="mymind-wrapped-top-tray__edge-control"
										onClick={() => void openChatwoot()}
									>
										<HelpCircle className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--help" />
									</button>
								) : (
									<span
										aria-hidden="true"
										className="mymind-wrapped-top-tray__utility-placeholder"
									/>
								)}
							</div>
						</div>
					</header>

					<div className="mymind-wrapped-stage-area">
						<div className="mymind-wrapped-stage-slot">{stageFrame}</div>
					</div>

					{hasFooter ? (
						/* Footer motion here is a local polish choice. Keep it subtle and anchored. */
						<motion.footer
							animate={
								shouldAnimateSetupEntrance
									? reduceMotion
										? WRAPPED_SETUP_ENTRANCE.footerReduced.animate
										: WRAPPED_SETUP_ENTRANCE.footer.animate
									: undefined
							}
							className="mymind-wrapped-dock"
							initial={
								shouldAnimateSetupEntrance
									? reduceMotion
										? WRAPPED_SETUP_ENTRANCE.footerReduced.initial
										: WRAPPED_SETUP_ENTRANCE.footer.initial
									: false
							}
							transition={
								shouldAnimateSetupEntrance
									? reduceMotion
										? WRAPPED_SETUP_ENTRANCE.footerReduced.transition
										: WRAPPED_SETUP_ENTRANCE.footer.transition
									: undefined
							}
						>
							<WrappedDebugControlStack>
								{footerDebugControls}
							</WrappedDebugControlStack>
							{footer}
						</motion.footer>
					) : null}
				</div>
			</div>
		</main>
	);
}

export function WrappedDebugControlStack(props: { children: ReactNode }) {
	const controls = Children.toArray(props.children);

	if (controls.length === 0) {
		return null;
	}

	const keyCounts = new Map<string, number>();

	return (
		<div className="mymind-wrapped-dock__debug-stack">
			{controls.map((control) => {
				const baseKey = resolveWrappedDebugControlBaseKey(control);
				const seenCount = keyCounts.get(baseKey) ?? 0;
				keyCounts.set(baseKey, seenCount + 1);
				const controlKey =
					seenCount === 0 ? baseKey : `${baseKey}:${seenCount}`;

				return (
					<div key={controlKey} className="mymind-wrapped-dock__debug-control">
						{control}
					</div>
				);
			})}
		</div>
	);
}

function resolveWrappedDebugControlBaseKey(control: ReactNode) {
	if (isValidElement(control)) {
		if (control.key !== null) {
			return `key:${String(control.key)}`;
		}

		const typeName =
			typeof control.type === "string" ? control.type : "component";
		const props =
			typeof control.props === "object" && control.props
				? (control.props as {
						"aria-label"?: unknown;
						ariaLabel?: unknown;
						className?: unknown;
					})
				: {};
		const label =
			typeof props["aria-label"] === "string"
				? props["aria-label"]
				: typeof props.ariaLabel === "string"
					? props.ariaLabel
					: typeof props.className === "string"
						? props.className
						: "";

		return `${typeName}:${label}`;
	}

	if (typeof control === "string" || typeof control === "number") {
		return `primitive:${String(control)}`;
	}

	return "node";
}
