import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import { getWrappedOnboardingProgressView } from "@/features/wrapped/wrapped-onboarding-progress";
import { cn } from "@/lib/utils";
import type {
	PreviewableWrappedStepId,
	WrappedPreviewOption,
	WrappedPrimaryStep,
} from "./config";
import { WRAPPED_SATURDAY_STEPS } from "./config";

interface WrappedOnboardingHeaderProps {
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	activeStep: WrappedPrimaryStep;
	activeStepIndex: number;
	isDebugControlsVisible: boolean;
	isStepTransitioning: boolean;
	onGoToStep: (nextStepIndex: number) => void;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
}

interface WrappedOnboardingFooterProps {
	activeStep: WrappedPrimaryStep;
	finalFooter?: ReactNode;
	isStepTransitioning: boolean;
	onContinue: () => void;
}

export function WrappedOnboardingHeader(props: WrappedOnboardingHeaderProps) {
	const {
		activePreviewOptions,
		activePreviewState,
		activePreviewStepId,
		activeStep,
		activeStepIndex,
		isDebugControlsVisible,
		isStepTransitioning,
		onGoToStep,
		onPreviewStateChange,
	} = props;
	const isDebugTrayVisible =
		isDebugControlsVisible && activePreviewStepId && activePreviewOptions;
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
							className="mymind-wrapped-back-button rounded-full transition-colors"
							onClick={() => onGoToStep(activeStepIndex - 1)}
						>
							<ChevronLeft className="size-4" />
						</button>
					) : (
						<Link
							to={appRoutes.dashboard()}
							aria-label="Close wrapped onboarding"
							className="mymind-wrapped-back-button rounded-full transition-colors"
						>
							<X className="size-4" />
						</Link>
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
					<span
						aria-hidden="true"
						className="mymind-wrapped-top-tray__utility-placeholder"
					/>
				</div>
			</div>

			{isDebugTrayVisible ? (
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
			) : null}
		</header>
	);
}

export function WrappedOnboardingFooter(props: WrappedOnboardingFooterProps) {
	const { activeStep, finalFooter, isStepTransitioning, onContinue } = props;

	return (
		<footer className="mymind-wrapped-dock">
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
