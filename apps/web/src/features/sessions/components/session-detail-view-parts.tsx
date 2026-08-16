import { Component, type ReactNode } from "react";
import { buttonVariants } from "@/app/ui/button";

type SessionDetailErrorBoundaryProps = {
	children: ReactNode;
	fallbackHref: string;
};

type SessionDetailErrorBoundaryState = {
	hasError: boolean;
};

export class SessionDetailErrorBoundary extends Component<
	SessionDetailErrorBoundaryProps,
	SessionDetailErrorBoundaryState
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error("[SessionDetailView] Failed to render session detail", error);
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div className="dashboardy-page flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-(--dashboardy-surface) px-6 py-10 text-(--dashboardy-heading)">
					<div className="dashboardy-card max-w-md rounded-[1.5rem] border px-6 py-5 text-center shadow-none">
						<p className="text-lg font-semibold text-(--dashboardy-heading)">
							Unable to render this session
						</p>
						<p className="mt-2 text-sm text-(--dashboardy-muted)">
							The session hit an unexpected application error. The rest of the
							workspace is still available.
						</p>
						<div className="mt-5 flex flex-wrap justify-center gap-2">
							<button
								className={buttonVariants({ size: "sm", variant: "outline" })}
								onClick={() => window.location.reload()}
								type="button"
							>
								Reload session
							</button>
							<a
								className={buttonVariants({ size: "sm", variant: "ghost" })}
								href={this.props.fallbackHref}
							>
								Back to sessions
							</a>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
