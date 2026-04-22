import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/app/ui/button";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import { WrappedRouteStageShell } from "./route-stage-shell";

type WrappedDevStage =
	| "auth"
	| "checking"
	| "setup"
	| "waiting"
	| "mobile"
	| "story";

const DEFAULT_WRAPPED_DEV_STAGE: WrappedDevStage = "auth";

const WRAPPED_DEV_STAGES: Array<{
	label: string;
	value: WrappedDevStage;
}> = [
	{ label: "Auth", value: "auth" },
	{ label: "Checking", value: "checking" },
	{ label: "Setup", value: "setup" },
	{ label: "Waiting", value: "waiting" },
	{ label: "Mobile", value: "mobile" },
	{ label: "Story", value: "story" },
];

export function WrappedDevPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeStage = getWrappedDevStage(searchParams.get("stage"));

	function setStage(nextStage: WrappedDevStage) {
		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);

				if (nextStage === DEFAULT_WRAPPED_DEV_STAGE) {
					nextSearchParams.delete("stage");
				} else {
					nextSearchParams.set("stage", nextStage);
				}

				return nextSearchParams;
			},
			{ replace: true },
		);
	}

	return (
		<>
			<WrappedDevToolbar activeStage={activeStage} onStageChange={setStage} />
			{activeStage === "auth" ? <WrappedDevAuthStage /> : null}
			{activeStage === "checking" ? <WrappedSetupPage mode="checking" /> : null}
			{activeStage === "setup" ? (
				<WrappedSetupPage
					mode="setup"
					onWaitForFirstSession={() => setStage("waiting")}
				/>
			) : null}
			{activeStage === "waiting" ? (
				<WrappedSetupPage
					mode="waiting"
					onBackToSetup={() => setStage("setup")}
				/>
			) : null}
			{activeStage === "mobile" ? (
				<WrappedDevMobileStage onContinueToSetup={() => setStage("setup")} />
			) : null}
			{activeStage === "story" ? <WrappedTeamCardPage /> : null}
		</>
	);
}

function WrappedDevToolbar(props: {
	activeStage: WrappedDevStage;
	onStageChange: (stage: WrappedDevStage) => void;
}) {
	const { activeStage, onStageChange } = props;

	return (
		<div className="fixed inset-x-4 top-4 z-[1000] mx-auto max-w-5xl rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
			<div className="flex flex-wrap items-center gap-2">
				<p className="mr-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
					Wrapped dev
				</p>
				{WRAPPED_DEV_STAGES.map((stage) => (
					<Button
						key={stage.value}
						onClick={() => onStageChange(stage.value)}
						size="sm"
						type="button"
						variant={activeStage === stage.value ? "default" : "outline"}
					>
						{stage.label}
					</Button>
				))}
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				Use this route to preview the outer wrapped flow without signing in or
				uploading sessions. The story stage keeps the existing wrapped preview
				controls.
			</p>
		</div>
	);
}

function WrappedDevAuthStage() {
	return (
		<div className="relative">
			<WrappedGuestPage />
			<div className="pointer-events-none fixed inset-x-4 bottom-4 z-[1000] mx-auto max-w-2xl rounded-2xl border border-border bg-[#FEFEFE]/95 px-4 py-3 text-sm text-muted-foreground shadow-lg backdrop-blur">
				Auth controls are interactive on <code>/dev/wrapped</code>. Use the
				stage switcher to continue through the rest of the flow.
			</div>
		</div>
	);
}

function WrappedDevMobileStage(props: { onContinueToSetup: () => void }) {
	const { onContinueToSetup } = props;
	const [isReady, setIsReady] = useState(false);

	return (
		<WrappedRouteStageShell
			description={
				<>
					This is a local preview of the mobile handoff screen. No email is sent
					from <code>/dev/wrapped</code>.
				</>
			}
			footer={
				<button
					type="button"
					className="mymind-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
					onClick={() => setIsReady(true)}
				>
					<span>Preview desktop link sent</span>
				</button>
			}
			objectClassName="mymind-wrapped-entry-card"
			stage={
				<>
					<ol className="mymind-wrapped-entry-card__list">
						<li>1. Request the desktop link from mobile.</li>
						<li>2. Open it on desktop.</li>
						<li>3. Continue into wrapped setup there.</li>
					</ol>

					{isReady ? (
						<div className="mymind-wrapped-entry-card__feedback is-success">
							<p className="mymind-wrapped-entry-card__feedback-copy">
								Dev preview only. In the real flow this state appears after the
								desktop link is created.
							</p>
							<Button
								type="button"
								variant="outline"
								className="mymind-wrapped-secondary-action rounded-full"
								onClick={onContinueToSetup}
							>
								Continue to desktop setup preview
							</Button>
						</div>
					) : null}
				</>
			}
			status="Continue on desktop"
			title="Continue on desktop"
			titleClassName="max-w-[11ch]"
		/>
	);
}

function getWrappedDevStage(stage: string | null): WrappedDevStage {
	return WRAPPED_DEV_STAGES.some((candidate) => candidate.value === stage)
		? (stage as WrappedDevStage)
		: DEFAULT_WRAPPED_DEV_STAGE;
}
