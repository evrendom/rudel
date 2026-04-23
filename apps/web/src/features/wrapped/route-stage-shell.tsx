import { ChevronLeft, HelpCircle, X } from "lucide-react";
import type { ReactNode } from "react";
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
	eyebrow?: ReactNode;
	footer?: ReactNode;
	leadingControl?: ReactNode | null;
	objectClassName?: string;
	progressStepId?: WrappedOnboardingProgressStepId;
	status?: ReactNode;
	stageClassName?: string;
	stage: ReactNode;
	title: ReactNode;
	titleClassName?: string;
}

export function WrappedRouteStageShell(props: WrappedRouteStageShellProps) {
	const {
		backLabel = "Close wrapped",
		description,
		eyebrow,
		footer,
		leadingControl,
		objectClassName,
		progressStepId,
		stageClassName,
		stage,
		status,
		title,
		titleClassName,
	} = props;
	const navigate = useNavigate();
	const progressView = progressStepId
		? getWrappedOnboardingProgressView(progressStepId)
		: null;
	const shouldUseReferenceTopChrome = progressView !== null;

	function handleDefaultBack() {
		const historyIndex =
			typeof window.history.state?.idx === "number"
				? window.history.state.idx
				: 0;

		if (historyIndex > 0) {
			navigate(-1);
		}
	}

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
						!footer ? "mymind-wrapped-shell__frame--no-footer" : null,
					)}
				>
					<header className="mymind-wrapped-top-tray">
						<div className="mymind-wrapped-top-tray__row">
							<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--start">
								{leadingControl !== undefined ? (
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
										onClick={handleDefaultBack}
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
								{progressView ? (
									<WrappedProgress
										ariaLabel="Wrapped onboarding progress"
										items={progressView.items.map((item) => ({
											ariaLabel: `Onboarding step ${item.stepNumber}: ${item.label}`,
											id: item.id,
											isActive: item.isActive,
										}))}
									/>
								) : status ? (
									<p className="mymind-wrapped-top-tray__status">{status}</p>
								) : null}
							</div>

							<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--end">
								{shouldUseReferenceTopChrome ? (
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
						<div className="mymind-wrapped-stage-slot">
							<WrappedStageFrame
								className={cn("mymind-wrapped-entry-stage", stageClassName)}
								copyClassName="mymind-wrapped-entry-stage__copy"
								objectClassName={cn(
									"mymind-wrapped-entry-stage__object",
									objectClassName,
								)}
								copy={
									<WrappedStageCopy
										description={description}
										descriptionClassName="mymind-wrapped-entry-stage__subline"
										eyebrow={eyebrow}
										eyebrowClassName="mymind-wrapped-entry-stage__eyebrow"
										title={title}
										titleClassName={cn(
											"mymind-wrapped-entry-stage__headline",
											titleClassName,
										)}
									/>
								}
								object={stage}
							/>
						</div>
					</div>

					{footer ? (
						<footer className="mymind-wrapped-dock">{footer}</footer>
					) : null}
				</div>
			</div>
		</main>
	);
}
