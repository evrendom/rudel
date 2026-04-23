import { Link as LinkIcon, Mail } from "lucide-react";
import { useRef, useState } from "react";
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
import { useMountEffect } from "@/hooks/useMountEffect";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";

type WrappedDevStage = "auth" | "setup" | "mobile" | "story";

const DEFAULT_WRAPPED_DEV_STAGE: WrappedDevStage = "auth";
const WRAPPED_DESKTOP_SETUP_URL = "app.rudel.ai/wrapped";
const WRAPPED_DEV_UPLOAD_TRANSITION_MS = 220;
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
			{activeStage === "setup" ? (
				<WrappedDevSetupStage onContinueToStory={() => setStage("story")} />
			) : null}
			{activeStage === "mobile" ? <WrappedDevMobileStage /> : null}
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
		<div className="fixed top-1 left-1/2 z-[1000] flex max-w-[calc(100%-0.5rem)] -translate-x-1/2 rounded-xl border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur">
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

function WrappedDevAuthStage() {
	return <WrappedGuestPage />;
}

function WrappedDevSetupStage(props: { onContinueToStory: () => void }) {
	const { onContinueToStory } = props;
	const [view, setView] = useState<"guide" | "uploading" | "uploaded">("guide");
	const [guideStep, setGuideStep] =
		useState<CliSetupStepId>("install-and-login");
	const uploadTransitionTimeoutRef = useRef<number | null>(null);
	const isInstallGuideStep = guideStep === "install-and-login";
	const uploadTransitionState = getWrappedUploadTransitionState(guideStep);
	const activeSetupView = view === "guide" ? "guide" : "uploaded";
	const isUploadedView = view === "uploaded";

	useMountEffect(() => {
		return () => {
			if (uploadTransitionTimeoutRef.current !== null) {
				window.clearTimeout(uploadTransitionTimeoutRef.current);
			}
		};
	});

	function handleViewChange(nextView: "guide" | "uploaded") {
		if (uploadTransitionTimeoutRef.current !== null) {
			window.clearTimeout(uploadTransitionTimeoutRef.current);
			uploadTransitionTimeoutRef.current = null;
		}

		if (nextView === "guide") {
			setView("guide");
			return;
		}

		if (view === "uploaded") {
			return;
		}

		setView("uploading");
		uploadTransitionTimeoutRef.current = window.setTimeout(() => {
			setView("uploaded");
			uploadTransitionTimeoutRef.current = null;
		}, WRAPPED_DEV_UPLOAD_TRANSITION_MS);
	}

	return (
		<>
			{isUploadedView ? (
				<WrappedSetupCompletePage
					onContinue={onContinueToStory}
					reposOverride={WRAPPED_DEBUG_UPLOADED_REPOS}
					totalSessionCount={10}
					userId="wrapped-dev-preview"
				/>
			) : (
				<WrappedSetupPage
					completedStepIdsOverride={
						view === "uploading"
							? uploadTransitionState.completedStepIds
							: undefined
					}
					currentStepIdOverride={
						view === "uploading"
							? uploadTransitionState.currentStepId
							: undefined
					}
					initialStepId={guideStep}
				/>
			)}
			<WrappedDevSetupPreviewToggle
				activeView={activeSetupView}
				canAdvanceGuideStep={view === "guide" && isInstallGuideStep}
				onAdvanceGuideStep={() => setGuideStep("enable-auto-upload")}
				onViewChange={handleViewChange}
			/>
		</>
	);
}

function getWrappedUploadTransitionState(guideStep: CliSetupStepId) {
	if (guideStep === "install-and-login") {
		return {
			completedStepIds: ["install-and-login"] as const,
			currentStepId: "enable-auto-upload" as const,
		};
	}

	return {
		completedStepIds: cliSetupCommands.map((step) => step.id),
		currentStepId: null,
	};
}

function WrappedDevMobileStage() {
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
		<div className="fixed top-8 left-1/2 z-[1000] flex max-w-[calc(100%-0.5rem)] -translate-x-1/2 rounded-xl border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur">
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
