import { Button } from "@/app/ui/button";
import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { WrappedRouteStageShell } from "./route-stage-shell";

type WrappedSetupPageMode = "checking" | "setup" | "waiting";

interface WrappedSetupPageProps {
	mode: WrappedSetupPageMode;
	onBackToSetup?: () => void;
	onWaitForFirstSession?: () => void;
}

export function WrappedSetupPage(props: WrappedSetupPageProps) {
	const { mode, onBackToSetup, onWaitForFirstSession } = props;

	if (mode === "checking") {
		return (
			<WrappedRouteStageShell
				description="Checking whether your first Geneva sessions already exist. Stay on this page for a moment."
				eyebrow="Wrapped setup"
				stage={
					<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status">
						<div className="mymind-wrapped-entry-card__status-dot" />
						<p className="mymind-wrapped-entry-card__status-copy">
							Looking for uploaded sessions and any in-flight share handoff.
						</p>
					</div>
				}
				status="Wrapped setup"
				title="Checking your uploaded sessions"
			/>
		);
	}

	if (mode === "waiting") {
		return (
			<WrappedRouteStageShell
				description="Leave this open after you run the commands. We will continue into the wrapped story as soon as your first session lands."
				eyebrow="Wrapped setup"
				footer={
					<div className="mymind-wrapped-action-stack">
						<Button
							className="mymind-wrapped-secondary-action rounded-full"
							onClick={onBackToSetup}
							variant="outline"
						>
							Back to setup
						</Button>
					</div>
				}
				stage={
					<div className="mymind-wrapped-entry-card">
						<div className="mymind-wrapped-entry-card__section">
							<p className="mymind-wrapped-entry-card__section-eyebrow">
								Listening for uploads
							</p>
							<div className="mymind-wrapped-entry-card__code">
								rudel upload
							</div>
							<p className="mymind-wrapped-entry-card__body">
								Keep this page open while you run the command on desktop. The
								wrapped story opens automatically as soon as the first session
								lands.
							</p>
						</div>
					</div>
				}
				status="Wrapped setup"
				title="Waiting for your first session"
			/>
		);
	}

	return (
		<WrappedRouteStageShell
			description="Run these commands on desktop. When your first session lands, we will continue into the wrapped story automatically."
			eyebrow="Wrapped setup"
			footer={
				<Button
					className="mymind-wrapped-entry-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
					onClick={onWaitForFirstSession}
				>
					I ran the commands. Wait for my first session
				</Button>
			}
			stage={<CliSetupHint variant="wrapped-story" />}
			status="Wrapped setup"
			title="Connect Rudel first"
		/>
	);
}
