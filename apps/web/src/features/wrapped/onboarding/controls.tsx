import { ChevronLeft, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { appRoutes } from "@/app/routes";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import { getWrappedOnboardingProgressView } from "@/features/wrapped/wrapped-onboarding-progress";
import { openChatwoot } from "@/lib/chatwoot";
import { cn } from "@/lib/utils";
import type {
	PreviewableWrappedStepId,
	WrappedPreviewOption,
	WrappedPrimaryStep,
} from "./config";
import { WRAPPED_SATURDAY_STEPS } from "./config";

interface WrappedOnboardingHeaderProps {
	activeStep: WrappedPrimaryStep;
	activeStepIndex: number;
	isStepTransitioning: boolean;
	onBack: () => void;
	onGoToStep: (nextStepIndex: number) => void;
}

interface WrappedOnboardingFooterProps {
	activeStep: WrappedPrimaryStep;
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	finalFooter?: ReactNode;
	generalDebugControls?: ReactNode;
	isDebugControlsVisible: boolean;
	isStepTransitioning: boolean;
	onContinue: () => void;
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
	} = props;
	const progressView = getWrappedOnboardingProgressView(activeStep.id);

	return (
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
							const routeIndex = WRAPPED_SATURDAY_STEPS.findIndex(
								(step) => step.id === item.id,
							);

							return {
								ariaLabel: `Go to onboarding step ${item.stepNumber}: ${item.label}`,
								id: item.id,
								isActive: item.isActive,
								onSelect:
									routeIndex >= 0 ? () => onGoToStep(routeIndex) : undefined,
							};
						})}
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
	);
}

export function WrappedOnboardingFooter(props: WrappedOnboardingFooterProps) {
	const {
		activePreviewOptions,
		activePreviewState,
		activePreviewStepId,
		activeStep,
		finalFooter,
		generalDebugControls,
		isDebugControlsVisible,
		isStepTransitioning,
		onContinue,
		onPreviewStateChange,
	} = props;
	const isStoryDebugTrayVisible =
		isDebugControlsVisible && activePreviewStepId && activePreviewOptions;
	const hasDebugControls =
		Boolean(generalDebugControls) || isStoryDebugTrayVisible;

	return (
		<footer className="mymind-wrapped-dock">
			{hasDebugControls ? (
				<div className="mymind-wrapped-dock__debug-stack">
					{generalDebugControls ? (
						<div className="mymind-wrapped-dock__debug-control">
							{generalDebugControls}
						</div>
					) : null}

					{isStoryDebugTrayVisible ? (
						<div className="mymind-wrapped-dock__debug-control">
							<WrappedOnboardingDebugTray
								activePreviewOptions={activePreviewOptions}
								activePreviewState={activePreviewState}
								activePreviewStepId={activePreviewStepId}
								activeStep={activeStep}
								isStepTransitioning={isStepTransitioning}
								onPreviewStateChange={onPreviewStateChange}
							/>
						</div>
					) : null}
				</div>
			) : null}

			{activeStep.kind === "final" ? (
				(finalFooter ?? (
					<WrappedPrimaryAction kind="link" to={appRoutes.dashboard()}>
						Done
					</WrappedPrimaryAction>
				))
			) : (
				<WrappedPrimaryAction
					kind="button"
					disabled={isStepTransitioning}
					onClick={onContinue}
				>
					Continue
				</WrappedPrimaryAction>
			)}
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
