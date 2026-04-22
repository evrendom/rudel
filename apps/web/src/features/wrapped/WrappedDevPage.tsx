import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/app/ui/button";
import { GuestApp } from "@/features/auth/GuestApp";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";

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
			<div className="pointer-events-none">
				<GuestApp
					description="This is a read-only preview of the wrapped auth surface. Use the dev stage switcher to move into setup, waiting, mobile handoff, or the story."
					eyebrow="Geneva Wrapped"
					showLogo={false}
					title="Sign in to start your wrapped"
				/>
			</div>
			<div className="pointer-events-none fixed inset-x-4 bottom-4 z-[1000] mx-auto max-w-2xl rounded-2xl border border-border bg-background/95 px-4 py-3 text-sm text-muted-foreground shadow-lg backdrop-blur">
				Auth controls are disabled on <code>/dev/wrapped</code>. Use the stage
				switcher to continue.
			</div>
		</div>
	);
}

function WrappedDevMobileStage(props: { onContinueToSetup: () => void }) {
	const { onContinueToSetup } = props;
	const [isReady, setIsReady] = useState(false);

	return (
		<section className="flex min-h-screen items-center bg-background px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-2xl space-y-8 text-center">
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
						Continue on desktop
					</p>
					<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
						Continue setup on desktop
					</h1>
					<p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
						This is a local preview of the mobile handoff screen. No email is
						sent from <code>/dev/wrapped</code>.
					</p>
				</div>

				<div className="space-y-4 rounded-3xl border border-border/70 bg-card px-5 py-6 text-left shadow-sm sm:px-6">
					<div className="space-y-2">
						<h2 className="text-sm font-semibold text-foreground">
							What happens next
						</h2>
						<ol className="space-y-2 text-sm leading-6 text-muted-foreground">
							<li>1. Request the desktop link from mobile.</li>
							<li>2. Open it on desktop.</li>
							<li>3. Continue into wrapped setup there.</li>
						</ol>
					</div>

					<Button
						className="w-full rounded-full"
						onClick={() => setIsReady(true)}
						size="lg"
						type="button"
					>
						Preview desktop link sent
					</Button>

					{isReady ? (
						<div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-4">
							<p className="text-sm leading-6 text-muted-foreground">
								Dev preview only. In the real flow this state appears after the
								desktop link is created.
							</p>
							<Button
								className="w-full"
								onClick={onContinueToSetup}
								size="lg"
								type="button"
								variant="outline"
							>
								Continue to desktop setup preview
							</Button>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

function getWrappedDevStage(stage: string | null): WrappedDevStage {
	return WRAPPED_DEV_STAGES.some((candidate) => candidate.value === stage)
		? (stage as WrappedDevStage)
		: DEFAULT_WRAPPED_DEV_STAGE;
}
