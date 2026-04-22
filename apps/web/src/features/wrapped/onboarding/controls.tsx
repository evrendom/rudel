import { ChevronLeft, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { cn } from "@/lib/utils";
import type {
	PreviewableWrappedStepId,
	WrappedPreviewOption,
	WrappedStep,
} from "./config";
import type {
	UploadStageModel,
	WrappedStoryProgress,
	WrappedVisibleProgressStep,
} from "./helpers";

interface WrappedOnboardingHeaderProps {
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	activeStep: WrappedStep;
	activeStepIndex: number;
	isDebugControlsVisible: boolean;
	isStepTransitioning: boolean;
	onGoToStep: (nextStepIndex: number) => void;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
	rewardTitle?: string;
	setupStatus: string | null;
	storyProgress: WrappedStoryProgress | null;
	visibleProgressSteps: readonly WrappedVisibleProgressStep[];
}

interface WrappedOnboardingFooterProps {
	activeStep: WrappedStep;
	activeUploadModel: UploadStageModel | null;
	finalFooter?: ReactNode;
	isStepTransitioning: boolean;
	onContinue: () => void;
}

interface WrappedSecondaryActionProps {
	children: ReactNode;
	disabled?: boolean;
	onClick?: () => void;
}

type WrappedPrimaryActionProps =
	| {
			children: ReactNode;
			disabled?: boolean;
			icon?: ReactNode;
			kind: "button";
			onClick?: () => void;
			type?: "button" | "reset" | "submit";
	  }
	| {
			children: ReactNode;
			kind: "link";
			to: string;
	  };

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
		rewardTitle,
		setupStatus,
		storyProgress,
		visibleProgressSteps,
	} = props;
	const title = getWrappedHeaderTitle(activeStep, rewardTitle, setupStatus);
	const isDebugTrayVisible =
		isDebugControlsVisible && activePreviewStepId && activePreviewOptions;

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
					{storyProgress ? (
						<nav
							className="mymind-wrapped-progress"
							aria-label="Wrapped story progress"
						>
								{visibleProgressSteps.map(({ displayNumber, routeIndex, step }) => (
									<button
										key={step.id}
									type="button"
									aria-current={routeIndex === activeStepIndex ? "step" : undefined}
										aria-label={`Go to story step ${displayNumber}: ${step.label}`}
										disabled={isStepTransitioning}
										className={cn(
											"mymind-wrapped-progress__button",
											routeIndex === activeStepIndex
												? "mymind-wrapped-progress__button--active"
												: "mymind-wrapped-progress__button--inactive",
										)}
										onClick={() => onGoToStep(routeIndex)}
									>
									<span
										aria-hidden="true"
										className={cn(
											"mymind-wrapped-progress__segment",
											routeIndex === activeStepIndex
												? "mymind-wrapped-progress__segment--active"
												: "mymind-wrapped-progress__segment--inactive",
										)}
									/>
								</button>
							))}
						</nav>
					) : (
						<p className="mymind-wrapped-top-tray__status">{title}</p>
					)}
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
								const [primaryLine, secondaryLine] =
									splitWrappedDebugLabel(option.label);

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
	const {
		activeStep,
		activeUploadModel,
		finalFooter,
		isStepTransitioning,
		onContinue,
	} = props;

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
					disabled={
						activeStep.id === "upload"
							? activeUploadModel?.isUploading
							: isStepTransitioning
					}
					icon={
						activeStep.id === "upload" && activeUploadModel?.isUploading ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : undefined
					}
					onClick={onContinue}
				>
					{activeStep.id === "upload" && activeUploadModel?.isUploading
						? "Uploading..."
						: "Continue"}
				</WrappedPrimaryAction>
			)}
		</footer>
	);
}

function WrappedPrimaryAction(props: WrappedPrimaryActionProps) {
	const className = cn(
		buttonVariants({}),
		"mymind-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
	);

	if (props.kind === "link") {
		return (
			<Link to={props.to} className={className}>
				{props.children}
			</Link>
		);
	}

	return (
		<button
			type={props.type ?? "button"}
			disabled={props.disabled}
			onClick={props.onClick}
			className={className}
		>
			<span>{props.children}</span>
			{props.icon ? (
				<span className="mymind-wrapped-primary-action__icon">
					{props.icon}
				</span>
			) : null}
		</button>
	);
}

export function WrappedSecondaryAction(props: WrappedSecondaryActionProps) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={props.onClick}
			className="mymind-wrapped-secondary-action [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
		>
			{props.children}
		</button>
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

function getWrappedHeaderTitle(
	activeStep: WrappedStep,
	rewardTitle: string | undefined,
	setupStatus: string | null,
) {
	if (activeStep.phase === "setup") {
		return setupStatus ?? "Preparing your story";
	}

	return activeStep.phase === "reward"
		? (rewardTitle ?? activeStep.label)
		: activeStep.label;
}
