import { Link as LinkIcon, Loader2, Mail } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Button } from "@/app/ui/button";
import { useMountEffect } from "@/hooks/useMountEffect";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";
import { WrappedDesktopResumePromptStage } from "./WrappedDesktopResumePromptStage";

const DEFAULT_WRAPPED_DESKTOP_SETUP_URL = "app.rudel.ai/wrapped";
const DEFAULT_WRAPPED_DESKTOP_SETUP_DESCRIPTION =
	"The next step will be to enable Rudel within the terminal on your desktop.";
const COPY_FEEDBACK_DURATION_MS = 1800;
const PRIMARY_BUTTON_LAUNCH_HOLD_MS = 180;
const PREVIEW_PRIMARY_ACTION_DURATION_MS = 820;

interface WrappedDesktopResumePreviewStageProps {
	copyValue?: string;
	copyVisibleLabel?: string;
	debugControls?: ReactNode;
	description?: ReactNode;
	desktopPreviewHref?: string;
	extraFeedback?: ReactNode;
	isPrimaryActionDisabled?: boolean;
	onPrimaryAction?: () => void;
	primaryActionLabel?: ReactNode;
	primaryActionState?: "idle" | "pending" | "success";
}

const WRAPPED_DESKTOP_HANDOFF_EASE = [0.22, 1, 0.36, 1] as const;

const WRAPPED_DESKTOP_HANDOFF_ENTRANCE = {
	fallback: {
		animate: { opacity: 1, y: 0 },
		initial: { opacity: 0, y: 12 },
		transition: {
			delay: 0.38,
			duration: 0.22,
			ease: WRAPPED_DESKTOP_HANDOFF_EASE,
		},
	},
	feedback: {
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: -8 },
		initial: { opacity: 0, y: 10 },
		transition: {
			duration: 0.22,
			ease: WRAPPED_DESKTOP_HANDOFF_EASE,
		},
	},
	buttonFill: {
		animate: { opacity: 0, scaleX: 1 },
		initial: { opacity: 0.2, scaleX: 0.18 },
		transition: {
			duration: 0.28,
			ease: WRAPPED_DESKTOP_HANDOFF_EASE,
		},
	},
	buttonContent: {
		animate: { opacity: 1, scale: 1, y: 0 },
		exit: { opacity: 0, scale: 0.985, y: -6 },
		initial: { opacity: 0, scale: 0.985, y: 6 },
		transition: {
			duration: 0.18,
			ease: WRAPPED_DESKTOP_HANDOFF_EASE,
		},
	},
	primary: {
		animate: { opacity: 1, scale: 1, y: 0 },
		initial: { opacity: 0, scale: 0.985, y: 10 },
		transition: {
			delay: 0.32,
			duration: 0.24,
			ease: WRAPPED_DESKTOP_HANDOFF_EASE,
		},
	},
} as const;

export function WrappedDesktopResumePreviewStage(
	props: WrappedDesktopResumePreviewStageProps,
) {
	const {
		copyValue,
		copyVisibleLabel,
		debugControls,
		description = DEFAULT_WRAPPED_DESKTOP_SETUP_DESCRIPTION,
		desktopPreviewHref = DEFAULT_WRAPPED_DESKTOP_SETUP_URL,
		extraFeedback,
		isPrimaryActionDisabled = false,
		onPrimaryAction,
		primaryActionLabel = "Send link to my mail",
		primaryActionState = "idle",
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [copied, setCopied] = useState(false);
	const [copyPulseKey, setCopyPulseKey] = useState(0);
	const [isPrimaryLaunching, setIsPrimaryLaunching] = useState(false);
	const [primaryPulseKey, setPrimaryPulseKey] = useState(0);
	const copyResetTimeoutRef = useRef<number | null>(null);
	const primaryLaunchTimeoutRef = useRef<number | null>(null);
	const previewPrimaryActionTimeoutRef = useRef<number | null>(null);
	const [previewPrimaryActionState, setPreviewPrimaryActionState] = useState<
		"idle" | "pending" | "success"
	>("idle");
	const copyTarget = copyValue ?? desktopPreviewHref;
	const copyLabel = copyVisibleLabel ?? desktopPreviewHref;
	const copyButtonState = copied ? "copied" : "idle";
	const shouldSimulatePrimaryAction = onPrimaryAction === undefined;
	const resolvedPrimaryActionState = shouldSimulatePrimaryAction
		? previewPrimaryActionState
		: primaryActionState;
	const resolvedPrimaryActionLabel =
		shouldSimulatePrimaryAction && resolvedPrimaryActionState === "success"
			? "Email sent!"
			: primaryActionLabel;
	const primaryVisualState =
		resolvedPrimaryActionState === "success"
			? "success"
			: isPrimaryLaunching || resolvedPrimaryActionState === "pending"
				? "pending"
				: "idle";
	const primaryActionContentKey =
		typeof resolvedPrimaryActionLabel === "string"
			? `${primaryVisualState}-${resolvedPrimaryActionLabel}`
			: primaryVisualState;
	const primaryActionAccessibilityLabel =
		primaryVisualState === "pending"
			? "Sending link..."
			: typeof resolvedPrimaryActionLabel === "string"
				? resolvedPrimaryActionLabel
				: undefined;

	useMountEffect(() => {
		return () => {
			if (copyResetTimeoutRef.current !== null) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}

			if (primaryLaunchTimeoutRef.current !== null) {
				window.clearTimeout(primaryLaunchTimeoutRef.current);
			}

			if (previewPrimaryActionTimeoutRef.current !== null) {
				window.clearTimeout(previewPrimaryActionTimeoutRef.current);
			}
		};
	});

	async function handleCopyDesktopLink() {
		const result = await copyTextToClipboardWithResult(copyTarget, {
			preferSelectionCopy: true,
			allowPromptFallback: true,
			promptMessage: "Copy desktop link: Cmd/Ctrl+C, Enter",
		});

		if (result !== "copied") {
			return;
		}

		setCopyPulseKey((currentValue) => currentValue + 1);
		setCopied(true);

		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}

		copyResetTimeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			copyResetTimeoutRef.current = null;
		}, COPY_FEEDBACK_DURATION_MS);
	}

	function handlePrimaryActionClick() {
		if (isPrimaryActionDisabled || resolvedPrimaryActionState !== "idle") {
			return;
		}

		if (primaryLaunchTimeoutRef.current !== null) {
			window.clearTimeout(primaryLaunchTimeoutRef.current);
		}

		setIsPrimaryLaunching(true);
		setPrimaryPulseKey((currentValue) => currentValue + 1);
		primaryLaunchTimeoutRef.current = window.setTimeout(() => {
			setIsPrimaryLaunching(false);
			primaryLaunchTimeoutRef.current = null;
		}, PRIMARY_BUTTON_LAUNCH_HOLD_MS);

		if (shouldSimulatePrimaryAction) {
			if (previewPrimaryActionTimeoutRef.current !== null) {
				window.clearTimeout(previewPrimaryActionTimeoutRef.current);
			}

			setPreviewPrimaryActionState("pending");
			previewPrimaryActionTimeoutRef.current = window.setTimeout(() => {
				setPreviewPrimaryActionState("success");
				previewPrimaryActionTimeoutRef.current = null;
			}, PREVIEW_PRIMARY_ACTION_DURATION_MS);
			return;
		}

		onPrimaryAction?.();
	}

	return (
		<WrappedDesktopResumePromptStage
			description={description}
			debugControls={debugControls}
			feedback={
				<>
					<motion.div
						animate={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.fallback.animate}
						className="grid w-full justify-items-center gap-3"
						initial={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.fallback.initial}
						transition={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.fallback.transition}
					>
						<div className="mymind-wrapped-entry-card__or-row">
							<span>OR</span>
						</div>
						<div className="mymind-wrapped-entry-card__desktop-copy-surface mymind-wrapped-entry-card__desktop-copy-surface--flat">
							<LinkIcon
								aria-hidden="true"
								className="mymind-wrapped-entry-card__desktop-copy-icon"
							/>
							<div className="mymind-wrapped-entry-card__desktop-copy-text">
								{copyLabel}
							</div>
							<button
								className="mymind-wrapped-entry-card__desktop-copy-button"
								onClick={() => void handleCopyDesktopLink()}
								type="button"
							>
								<AnimatePresence initial={false}>
									{copyPulseKey > 0 ? (
										<motion.span
											key={`copy-sheen-${copyPulseKey}`}
											aria-hidden="true"
											className="mymind-wrapped-button-motion-sheen"
											animate={
												reduceMotion
													? { opacity: [0, 0.18, 0] }
													: {
															opacity: [0, 0.22, 0],
															x: ["-130%", "130%"],
														}
											}
											initial={
												reduceMotion
													? { opacity: 0 }
													: { opacity: 0, x: "-130%" }
											}
											transition={
												reduceMotion
													? { duration: 0.2, ease: "linear" }
													: {
															duration: 0.38,
															ease: WRAPPED_DESKTOP_HANDOFF_EASE,
														}
											}
										/>
									) : null}
								</AnimatePresence>
								<span className="mymind-wrapped-button-motion-shell">
									<AnimatePresence initial={false} mode="wait">
										<motion.span
											key={copyButtonState}
											animate={
												WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.animate
											}
											className="mymind-wrapped-button-motion-content mymind-wrapped-button-motion-content--copy"
											exit={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.exit}
											initial={
												WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.initial
											}
											transition={
												WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent
													.transition
											}
										>
											<span className="mymind-wrapped-button-motion-label">
												{copied ? "Copied" : "Copy"}
											</span>
										</motion.span>
									</AnimatePresence>
								</span>
							</button>
						</div>
					</motion.div>
					<AnimatePresence initial={false}>
						{extraFeedback ? (
							<motion.div
								key="desktop-handoff-feedback"
								animate={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.feedback.animate}
								exit={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.feedback.exit}
								initial={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.feedback.initial}
								transition={
									WRAPPED_DESKTOP_HANDOFF_ENTRANCE.feedback.transition
								}
							>
								{extraFeedback}
							</motion.div>
						) : null}
					</AnimatePresence>
				</>
			}
			primaryAction={
				<motion.div
					animate={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.primary.animate}
					initial={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.primary.initial}
					transition={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.primary.transition}
				>
					<Button
						type="button"
						className="mymind-wrapped-entry-action mymind-wrapped-mobile-handoff-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						data-motion-state={primaryVisualState}
						aria-label={primaryActionAccessibilityLabel}
						disabled={isPrimaryActionDisabled}
						onClick={handlePrimaryActionClick}
					>
						<AnimatePresence initial={false}>
							{isPrimaryLaunching ? (
								<motion.span
									key="primary-fill"
									aria-hidden="true"
									className="mymind-wrapped-button-motion-fill"
									animate={
										reduceMotion
											? { opacity: [0.16, 0] }
											: WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonFill.animate
									}
									initial={
										reduceMotion
											? { opacity: 0.16 }
											: WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonFill.initial
									}
									transition={
										reduceMotion
											? { duration: 0.18, ease: "linear" }
											: WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonFill.transition
									}
								/>
							) : null}
						</AnimatePresence>
						<AnimatePresence initial={false}>
							{primaryPulseKey > 0 ? (
								<motion.span
									key={`primary-sheen-${primaryPulseKey}`}
									aria-hidden="true"
									className="mymind-wrapped-button-motion-sheen mymind-wrapped-button-motion-sheen--primary"
									animate={
										reduceMotion
											? { opacity: [0, 0.24, 0] }
											: {
													opacity: [0, 0.34, 0],
													x: ["-130%", "130%"],
												}
									}
									initial={
										reduceMotion ? { opacity: 0 } : { opacity: 0, x: "-130%" }
									}
									transition={
										reduceMotion
											? { duration: 0.2, ease: "linear" }
											: {
													duration: 0.4,
													ease: WRAPPED_DESKTOP_HANDOFF_EASE,
												}
									}
								/>
							) : null}
						</AnimatePresence>
						<span className="mymind-wrapped-button-motion-shell">
							<span className="relative inline-flex min-w-0 items-center justify-center overflow-hidden">
								<AnimatePresence initial={false} mode="wait">
									<motion.span
										key={primaryActionContentKey}
										animate={
											WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.animate
										}
										className="mymind-wrapped-button-motion-content"
										exit={WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.exit}
										initial={
											WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.initial
										}
										transition={
											WRAPPED_DESKTOP_HANDOFF_ENTRANCE.buttonContent.transition
										}
									>
										{primaryVisualState === "pending" ? (
											<>
												<Loader2
													aria-hidden="true"
													className={
														reduceMotion
															? "mymind-wrapped-mobile-handoff-action__icon mymind-wrapped-mobile-handoff-action__icon--centered"
															: "mymind-wrapped-mobile-handoff-action__icon mymind-wrapped-mobile-handoff-action__icon--centered animate-spin"
													}
												/>
												<span className="sr-only">Sending link...</span>
											</>
										) : primaryVisualState === "success" ? (
											<span className="mymind-wrapped-button-motion-label">
												{resolvedPrimaryActionLabel}
											</span>
										) : (
											<>
												<span className="mymind-wrapped-button-motion-icon">
													<Mail
														aria-hidden="true"
														className="mymind-wrapped-mobile-handoff-action__icon"
													/>
												</span>
												<span className="mymind-wrapped-button-motion-label">
													{resolvedPrimaryActionLabel}
												</span>
											</>
										)}
									</motion.span>
								</AnimatePresence>
							</span>
						</span>
					</Button>
				</motion.div>
			}
		/>
	);
}
