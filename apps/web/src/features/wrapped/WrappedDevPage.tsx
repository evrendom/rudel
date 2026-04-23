import { startTransition, type ReactNode, useState } from "react";
import { Link as LinkIcon, Mail } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/app/ui/button";
import {
	type CliSetupStepId,
	cliSetupCommands,
} from "@/components/analytics/CliSetupHint";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedDesktopResumePromptStage } from "@/features/wrapped/WrappedDesktopResumePromptStage";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import {
	WrappedSetupCompletePage,
	type WrappedUploadedRepoRow,
} from "@/features/wrapped/WrappedSetupCompletePage";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";

type WrappedDevStage = "auth" | "setup" | "mobile" | "story";
type WrappedDevSetupView = "guide" | "uploaded";

const DEFAULT_WRAPPED_DEV_STAGE: WrappedDevStage = "auth";
const DEFAULT_WRAPPED_DEV_SETUP_VIEW: WrappedDevSetupView = "guide";
const WRAPPED_DEV_SETUP_VIEW_QUERY_PARAM = "setup-view";
const WRAPPED_DEV_SETUP_STEP_QUERY_PARAM = "setup-step";
const WRAPPED_DESKTOP_SETUP_URL = "app.rudel.ai/wrapped";
const WRAPPED_DEBUG_UPLOADED_REPOS: WrappedUploadedRepoRow[] = [
	{
		name: "geneva",
		projectPath: "/Users/evren/geneva",
		sessions: 1,
	},
	{
		name: "@acme/design-system",
		projectPath: "/Users/evren/design-system",
		sessions: 1,
	},
	{
		name: "rudel-cli",
		projectPath: "/Users/evren/rudel-cli",
		sessions: 1,
	},
	{
		name: "agentation",
		projectPath: "/Users/evren/agentation",
		sessions: 1,
	},
	{
		name: "analytics-pipeline",
		projectPath: "/Users/evren/analytics-pipeline",
		sessions: 1,
	},
	{
		name: "docs-site",
		projectPath: "/Users/evren/docs-site",
		sessions: 1,
	},
	{
		name: "infra",
		projectPath: "/Users/evren/infra",
		sessions: 1,
	},
	{
		name: "mobile-app",
		projectPath: "/Users/evren/mobile-app",
		sessions: 1,
	},
	{
		name: "playground",
		projectPath: "/Users/evren/playground",
		sessions: 1,
	},
	{
		name: "web-sdk",
		projectPath: "/Users/evren/web-sdk",
		sessions: 1,
	},
];

const WRAPPED_DEV_STAGES: Array<{
	label: string;
	value: WrappedDevStage;
}> = [
	{ label: "Auth", value: "auth" },
	{ label: "Setup", value: "setup" },
	{ label: "Mobile", value: "mobile" },
	{ label: "Story", value: "story" },
];

export function WrappedDevPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeStage = getWrappedDevStage(searchParams.get("stage"));
	const activeSetupView = getWrappedDevSetupView(
		searchParams.get(WRAPPED_DEV_SETUP_VIEW_QUERY_PARAM),
	);
	const activeGuideStep = getWrappedDevSetupStep(
		searchParams.get(WRAPPED_DEV_SETUP_STEP_QUERY_PARAM),
	);

	function updateWrappedDevSearchParams(updates: {
		stage?: WrappedDevStage;
		setupStep?: CliSetupStepId;
		setupView?: WrappedDevSetupView;
	}) {
		startTransition(() => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);

					if (updates.setupStep === undefined) {
						nextSearchParams.delete(WRAPPED_DEV_SETUP_STEP_QUERY_PARAM);
					} else {
						nextSearchParams.set(
							WRAPPED_DEV_SETUP_STEP_QUERY_PARAM,
							updates.setupStep,
						);
					}

					if (
						updates.setupView === undefined ||
						updates.setupView === DEFAULT_WRAPPED_DEV_SETUP_VIEW
					) {
						nextSearchParams.delete(WRAPPED_DEV_SETUP_VIEW_QUERY_PARAM);
					} else {
						nextSearchParams.set(
							WRAPPED_DEV_SETUP_VIEW_QUERY_PARAM,
							updates.setupView,
						);
					}

					const nextStage = updates.stage ?? DEFAULT_WRAPPED_DEV_STAGE;
					if (nextStage === DEFAULT_WRAPPED_DEV_STAGE) {
						nextSearchParams.delete("stage");
					} else {
						nextSearchParams.set("stage", nextStage);
					}

					return nextSearchParams;
				},
				{ replace: false },
			);
		});
	}

	function setStage(nextStage: WrappedDevStage) {
		if (nextStage === activeStage) {
			return;
		}

		updateWrappedDevSearchParams({
			stage: nextStage,
			setupStep: activeGuideStep,
			setupView: activeSetupView,
		});
	}

	return (
		<>
			{activeStage === "auth" ? (
				<WrappedDevAuthStage
					debugControls={
						<WrappedDevToolbar activeStage={activeStage} onStageChange={setStage} />
					}
				/>
			) : null}
			{activeStage === "setup" ? (
				<WrappedDevSetupStage
					activeView={activeSetupView}
					debugControls={
						<>
							<WrappedDevToolbar
								activeStage={activeStage}
								onStageChange={setStage}
							/>
							<WrappedDevSetupPreviewToggle
								activeView={activeSetupView}
								canAdvanceGuideStep={
									activeSetupView === "guide" &&
									activeGuideStep === "install-and-login"
								}
								onAdvanceGuideStep={() =>
									updateWrappedDevSearchParams({
										stage: "setup",
										setupStep: "enable-auto-upload",
										setupView: activeSetupView,
									})
								}
								onViewChange={(nextView) =>
									updateWrappedDevSearchParams({
										stage: "setup",
										setupStep: activeGuideStep,
										setupView: nextView,
									})
								}
							/>
						</>
					}
					guideStep={activeGuideStep}
					onContinueToStory={() => setStage("story")}
				/>
			) : null}
			{activeStage === "mobile" ? (
				<WrappedDevMobileStage
					debugControls={
						<WrappedDevToolbar activeStage={activeStage} onStageChange={setStage} />
					}
				/>
			) : null}
			{activeStage === "story" ? (
				<WrappedTeamCardPage
					debugControls={
						<WrappedDevToolbar activeStage={activeStage} onStageChange={setStage} />
					}
					onBackFromFirstStep={() =>
						updateWrappedDevSearchParams({
							stage: "setup",
							setupStep: activeGuideStep,
							setupView: "uploaded",
						})
					}
				/>
			) : null}
		</>
	);
}

function WrappedDevToolbar(props: {
	activeStage: WrappedDevStage;
	onStageChange: (stage: WrappedDevStage) => void;
}) {
	const { activeStage, onStageChange } = props;

	return (
		<div className="flex w-full rounded-xl border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur">
			<div className="flex flex-wrap items-center gap-1">
				{WRAPPED_DEV_STAGES.map((stage) => (
					<Button
						key={stage.value}
						onClick={() => onStageChange(stage.value)}
						size="xs"
						type="button"
						variant={activeStage === stage.value ? "default" : "outline"}
						className="h-5 rounded-md px-1.5 text-[8px] leading-none"
					>
						{stage.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function WrappedDevAuthStage(props: { debugControls: ReactNode }) {
	return <WrappedGuestPage debugControls={props.debugControls} />;
}

function WrappedDevSetupStage(props: {
	activeView: WrappedDevSetupView;
	debugControls: ReactNode;
	guideStep: CliSetupStepId;
	onContinueToStory: () => void;
}) {
	const { activeView, debugControls, guideStep, onContinueToStory } = props;
	const isUploadedView = activeView === "uploaded";

	return (
		<>
			{isUploadedView ? (
				<WrappedSetupCompletePage
					debugControls={debugControls}
					onContinue={onContinueToStory}
					reposOverride={WRAPPED_DEBUG_UPLOADED_REPOS}
					totalSessionCount={10}
					userId="wrapped-dev-preview"
				/>
			) : (
				<WrappedSetupPage
					debugControls={debugControls}
					initialStepId={guideStep}
				/>
			)}
		</>
	);
}

function WrappedDevMobileStage(props: { debugControls: ReactNode }) {
	const desktopPreviewHref = WRAPPED_DESKTOP_SETUP_URL;
	const [copied, setCopied] = useState(false);

	async function handleCopyDesktopLink() {
		const result = await copyTextToClipboardWithResult(desktopPreviewHref, {
			preferSelectionCopy: true,
			allowPromptFallback: true,
			promptMessage: "Copy desktop link: Cmd/Ctrl+C, Enter",
		});

		if (result !== "copied") {
			return;
		}

		setCopied(true);

		window.setTimeout(() => {
			setCopied(false);
		}, 1800);
	}

	return (
		<WrappedDesktopResumePromptStage
			description="The next step will be to enable Rudel within the terminal on your desktop."
			debugControls={props.debugControls}
			feedback={
				<>
					<div className="mymind-wrapped-entry-card__or-row">
						<span>OR</span>
					</div>
					<div className="mymind-wrapped-entry-card__desktop-copy-surface mymind-wrapped-entry-card__desktop-copy-surface--flat">
						<LinkIcon
							aria-hidden="true"
							className="mymind-wrapped-entry-card__desktop-copy-icon"
						/>
						<div className="mymind-wrapped-entry-card__desktop-copy-text">
							{desktopPreviewHref}
						</div>
						<button
							className="mymind-wrapped-entry-card__desktop-copy-button"
							onClick={() => void handleCopyDesktopLink()}
							type="button"
						>
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
				</>
			}
			primaryAction={
				<Button
					type="button"
					className="mymind-wrapped-entry-action mymind-wrapped-mobile-handoff-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
				>
					<Mail
						aria-hidden="true"
						className="mymind-wrapped-mobile-handoff-action__icon"
					/>
					Send link to my mail
				</Button>
			}
		/>
	);
}

function WrappedDevSetupPreviewToggle(props: {
	activeView: "guide" | "uploaded";
	canAdvanceGuideStep: boolean;
	onAdvanceGuideStep: () => void;
	onViewChange: (nextView: "guide" | "uploaded") => void;
}) {
	const { activeView, canAdvanceGuideStep, onAdvanceGuideStep, onViewChange } =
		props;

	return (
		<div className="flex w-full rounded-xl border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur">
			<div className="flex items-center gap-1">
				<Button
					type="button"
					size="xs"
					variant={activeView === "guide" ? "default" : "outline"}
					className="h-5 rounded-md px-1.5 text-[8px] leading-none"
					onClick={() => onViewChange("guide")}
				>
					Guide
				</Button>
				<Button
					type="button"
					size="xs"
					variant={activeView === "uploaded" ? "default" : "outline"}
					className="h-5 rounded-md px-1.5 text-[8px] leading-none"
					onClick={() => onViewChange("uploaded")}
				>
					Uploaded
				</Button>
				{activeView === "guide" && canAdvanceGuideStep ? (
					<Button
						type="button"
						size="xs"
						variant="outline"
						className="h-5 rounded-md px-1.5 text-[8px] leading-none"
						onClick={onAdvanceGuideStep}
					>
						Debug next
					</Button>
				) : null}
			</div>
		</div>
	);
}

function getWrappedDevStage(stage: string | null): WrappedDevStage {
	return WRAPPED_DEV_STAGES.some((candidate) => candidate.value === stage)
		? (stage as WrappedDevStage)
		: DEFAULT_WRAPPED_DEV_STAGE;
}

function getWrappedDevSetupView(setupView: string | null): WrappedDevSetupView {
	return setupView === "uploaded" ? "uploaded" : DEFAULT_WRAPPED_DEV_SETUP_VIEW;
}

function getWrappedDevSetupStep(setupStep: string | null): CliSetupStepId {
	return cliSetupCommands.some((step) => step.id === setupStep)
		? (setupStep as CliSetupStepId)
		: "install-and-login";
}
