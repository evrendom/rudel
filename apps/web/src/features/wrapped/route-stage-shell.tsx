import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { cn } from "@/lib/utils";
import "@/features/wrapped/wrapped.css";

interface WrappedRouteStageShellProps {
	backLabel?: string;
	backTo?: string;
	description?: ReactNode;
	eyebrow?: ReactNode;
	footer?: ReactNode;
	objectClassName?: string;
	stage: ReactNode;
	status: ReactNode;
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
		objectClassName,
		stage,
		status,
		title,
		titleClassName,
	} = props;

	return (
		<main className="mymind-wrapped-route mymind-wrapped-route--onboarding">
			<div className="mymind-wrapped-shell relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground">
				<div className="mymind-wrapped-shell__frame">
					<header className="mymind-wrapped-top-tray">
						<div className="mymind-wrapped-top-tray__row">
							<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--start">
								<Link
									to={backTo}
									aria-label={backLabel}
									className="mymind-wrapped-back-button rounded-full transition-colors"
								>
									<X className="size-4" />
								</Link>
							</div>

							<div className="mymind-wrapped-top-tray__center">
								<p className="mymind-wrapped-top-tray__status">{status}</p>
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
							<section className="mymind-wrapped-entry-stage">
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
