import { ChevronLeft, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { cn } from "@/lib/utils";
import {
	type PreviewableWrappedStepId,
	UPLOAD_STEP,
	type WrappedPreviewOption,
	type WrappedStep,
} from "./config";
import {
	getStepDisplayNumber,
	type UploadStageModel,
	type WrappedVisibleProgressStep,
} from "./helpers";

interface WrappedOnboardingHeaderProps {
	activePreviewOptions: readonly WrappedPreviewOption[] | null;
	activePreviewState: string;
	activePreviewStepId: PreviewableWrappedStepId | null;
	activeStep: WrappedStep;
	activeStepIndex: number;
	isStepTransitioning: boolean;
	onGoToStep: (nextStepIndex: number) => void;
	onPreviewStateChange: (
		stepId: PreviewableWrappedStepId,
		value: string,
	) => void;
	visibleProgressSteps: readonly WrappedVisibleProgressStep[];
}

interface WrappedOnboardingFooterProps {
	activeStep: WrappedStep;
	activeStepIndex: number;
	activeUploadModel: UploadStageModel | null;
	finalFooter?: ReactNode;
	isStepTransitioning: boolean;
	onContinue: () => void;
	onGoToStep: (nextStepIndex: number) => void;
}

interface WrappedSecondaryActionProps {
	children: ReactNode;
	disabled?: boolean;
	onClick?: () => void;
}

interface WrappedActionStackProps {
	continueDisabled?: boolean;
	continueIcon?: ReactNode;
	continueLabel: string;
	onContinue?: () => void;
	onSecondaryAction?: () => void;
	secondaryActionDisabled?: boolean;
	secondaryActionLabel?: string;
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
		isStepTransitioning,
		onGoToStep,
		onPreviewStateChange,
		visibleProgressSteps,
	} = props;

	return (
		<header className="space-y-3">
			<div className="mymind-wrapped-header-row">
				{activeStepIndex > 0 ? (
					<button
						type="button"
						aria-label={`Go back to ${activeStepIndex === 1 ? "step -1" : `step ${getStepDisplayNumber(activeStepIndex - 1)}`}`}
						disabled={isStepTransitioning}
						className="mymind-wrapped-back-button rounded-full border border-border bg-background text-foreground transition-colors hover:text-foreground"
						onClick={() => onGoToStep(activeStepIndex - 1)}
					>
						<ChevronLeft className="size-4" />
					</button>
				) : null}

				<div className="mymind-wrapped-progress">
					<button
						type="button"
						aria-label={`Go to step -1: ${UPLOAD_STEP.label}`}
						disabled={isStepTransitioning}
						className={cn(
							"mymind-wrapped-progress__button rounded-full border text-[0.72rem] font-medium tabular-nums transition-colors",
							activeStepIndex === 0
								? "border-foreground bg-foreground text-background"
								: "border-border bg-background text-muted-foreground hover:text-foreground",
						)}
						onClick={() => onGoToStep(0)}
					>
						-1
					</button>
					{visibleProgressSteps.map(({ step, stepIndex }) => {
						const displayStepNumber = getStepDisplayNumber(stepIndex);

						return (
							<button
								key={step.id}
								type="button"
								aria-label={`Go to step ${displayStepNumber}: ${step.label}`}
								disabled={isStepTransitioning}
								className={cn(
									"mymind-wrapped-progress__button rounded-full border text-[0.72rem] font-medium tabular-nums transition-colors",
									stepIndex === activeStepIndex
										? "border-foreground bg-foreground text-background"
										: "border-border bg-background text-muted-foreground hover:text-foreground",
								)}
								onClick={() => onGoToStep(stepIndex)}
							>
								{displayStepNumber}
							</button>
						);
					})}
				</div>
			</div>

			{activePreviewStepId && activePreviewOptions ? (
				<div className="w-full rounded-full border border-border/50 bg-background/65 px-2 py-1">
					<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<fieldset className="flex flex-nowrap gap-1">
							<legend className="sr-only">{`${activeStep.label} preview states`}</legend>
							{activePreviewOptions.map((option) => {
								const isSelected = option.value === activePreviewState;

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
											"min-h-11 shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium transition-colors",
											isSelected
												? "border-foreground bg-foreground text-background"
												: "border-border bg-background text-muted-foreground hover:text-foreground",
										)}
									>
										{option.label}
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
		activeStepIndex,
		activeUploadModel,
		finalFooter,
		isStepTransitioning,
		onContinue,
		onGoToStep,
	} = props;

	return (
		<footer className="mymind-wrapped-step-footer mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
			{activeStep.kind === "final" ? (
				(finalFooter ?? (
					<WrappedPrimaryAction kind="link" to={appRoutes.dashboard()}>
						Done
					</WrappedPrimaryAction>
				))
			) : activeStep.id === "upload" ? (
				<WrappedActionStack
					continueDisabled={activeUploadModel?.isUploading}
					continueIcon={
						activeUploadModel?.isUploading ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : undefined
					}
					continueLabel={
						activeUploadModel?.isUploading ? "Uploading..." : "Continue"
					}
					onContinue={() => onGoToStep(activeStepIndex + 1)}
					secondaryActionLabel={
						activeUploadModel?.secondaryActionLabel ?? undefined
					}
				/>
			) : (
				<WrappedActionStack
					continueDisabled={isStepTransitioning}
					continueLabel="Continue"
					onContinue={onContinue}
				/>
			)}
		</footer>
	);
}

function WrappedActionStack(props: WrappedActionStackProps) {
	return (
		<div className="mymind-wrapped-action-stack">
			<WrappedPrimaryAction
				kind="button"
				disabled={props.continueDisabled}
				onClick={props.onContinue}
				icon={props.continueIcon}
			>
				{props.continueLabel}
			</WrappedPrimaryAction>

			{props.secondaryActionLabel ? (
				<WrappedSecondaryAction
					disabled={props.secondaryActionDisabled}
					onClick={props.onSecondaryAction}
				>
					{props.secondaryActionLabel}
				</WrappedSecondaryAction>
			) : null}
		</div>
	);
}

function WrappedPrimaryAction(props: WrappedPrimaryActionProps) {
	const className = cn(
		buttonVariants({}),
		"mymind-wrapped-primary-action h-11 rounded-full px-7 [font-family:'Nunito',var(--font-sans)] text-[19px] font-bold",
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

function WrappedSecondaryAction(props: WrappedSecondaryActionProps) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={props.onClick}
			className="mymind-wrapped-secondary-action [font-family:'Nunito',var(--font-sans)] text-[19px] font-bold"
		>
			{props.children}
		</button>
	);
}
