import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import {
	getWrappedOnboardingProgressView,
	type WrappedOnboardingProgressStepId,
} from "@/features/wrapped/wrapped-onboarding-progress";
import { cn } from "@/lib/utils";
import "@/features/wrapped/wrapped.css";

interface WrappedRouteStageShellProps {
	backLabel?: string;
	backTo?: string;
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
		backTo = appRoutes.dashboard(),
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
	const progressView = progressStepId
		? getWrappedOnboardingProgressView(progressStepId)
		: null;

	return (
		<main className="mymind-wrapped-route mymind-wrapped-route--onboarding">
			<div className="mymind-wrapped-shell relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground">
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
									<Link
										to={backTo}
										aria-label={backLabel}
										className="mymind-wrapped-back-button rounded-full transition-colors"
									>
										<X className="size-4" />
									</Link>
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
								<span
									aria-hidden="true"
									className="mymind-wrapped-top-tray__utility-placeholder"
								/>
							</div>
						</div>
					</header>

					<div className="mymind-wrapped-stage-area">
						<div className="mymind-wrapped-stage-slot">
							<section
								className={cn("mymind-wrapped-entry-stage", stageClassName)}
							>
								<div className="mymind-wrapped-entry-stage__copy">
									{eyebrow ? (
										<p className="mymind-wrapped-entry-stage__eyebrow">
											{eyebrow}
										</p>
									) : null}
									<h1
										className={cn(
											"mymind-wrapped-entry-stage__headline",
											titleClassName,
										)}
									>
										{title}
									</h1>
									{description ? (
										<div className="mymind-wrapped-entry-stage__subline">
											{description}
										</div>
									) : null}
								</div>

								<div
									className={cn(
										"mymind-wrapped-entry-stage__object",
										objectClassName,
									)}
								>
									{stage}
								</div>
							</section>
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
