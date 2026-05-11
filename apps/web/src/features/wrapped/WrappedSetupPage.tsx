import { ArrowRight } from "lucide-react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	CliSetupHint,
	type CliSetupStepId,
	cliSetupCommands,
} from "@/components/analytics/CliSetupHint";
import { openChatwoot } from "@/lib/chatwoot";
import { WrappedPrimaryAction } from "./actions";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";

const WRAPPED_SETUP_SUPPORT_PROMPT_DELAY_MS = 60_000;
const WRAPPED_SETUP_SUPPORT_PROMPT_STORAGE_KEY =
	"wrapped:setup-support-prompt-shown";

interface WrappedSetupPageProps {
	backLabel?: string;
	completedStepIdsOverride?: readonly CliSetupStepId[];
	currentStepIdOverride?: CliSetupStepId | null;
	debugControls?: ReactNode;
	initialStepId?: CliSetupStepId;
	onBack?: () => void;
	onContinue?: () => void;
}

export function WrappedSetupPage(props: WrappedSetupPageProps) {
	const {
		backLabel = "Go back",
		completedStepIdsOverride,
		currentStepIdOverride,
		debugControls,
		initialStepId,
		onBack,
		onContinue,
	} = props;
	const lastStepIndex = cliSetupCommands.length - 1;
	const initialStepIndex = getInitialStepIndex(initialStepId, lastStepIndex);
	const currentStepIndex = initialStepIndex;
	const derivedCurrentStepId =
		cliSetupCommands[Math.min(currentStepIndex, lastStepIndex)]?.id ??
		cliSetupCommands[0].id;
	const derivedCompletedStepIds = useMemo(
		() =>
			cliSetupCommands
				.slice(0, currentStepIndex)
				.map((step) => step.id) as CliSetupStepId[],
		[currentStepIndex],
	);
	const currentStepId =
		currentStepIdOverride === undefined
			? derivedCurrentStepId
			: currentStepIdOverride;
	const completedStepIds = completedStepIdsOverride ?? derivedCompletedStepIds;
	const isSetupComplete = cliSetupCommands.every((step) =>
		completedStepIds.includes(step.id),
	);
	const shouldOfferUploadSupport = currentStepId === "enable-auto-upload";

	return (
		<MotionConfig reducedMotion="user">
			<WrappedRouteStageShell
				backLabel={backLabel}
				description={
					<>
						<p>Start sending sessions to Rudel.</p>
						{debugControls ? (
							<WrappedDebugControlStack>
								{debugControls}
							</WrappedDebugControlStack>
						) : null}
					</>
				}
				entrancePreset="setup"
				leadingControl={onBack ? undefined : null}
				onBack={onBack}
				progressStepId="desktop-ready"
				stageClassName="mymind-wrapped-entry-stage--setup"
				stage={
					<div className="mymind-wrapped-setup-guide">
						{shouldOfferUploadSupport ? <WrappedSetupSupportPrompt /> : null}
						<CliSetupHint
							completedStepIds={completedStepIds}
							currentStepId={currentStepId}
							hideAlternateCommandCaption
							variant="wrapped-story"
						/>
					</div>
				}
				title="Set up Rudel"
				footer={
					onContinue ? (
						<WrappedPrimaryAction
							kind="button"
							disabled={!isSetupComplete}
							icon={<ArrowRight className="size-4" />}
							onClick={onContinue}
						>
							Continue
						</WrappedPrimaryAction>
					) : undefined
				}
			/>
		</MotionConfig>
	);
}

function WrappedSetupSupportPrompt() {
	const [isVisible, setIsVisible] = useState(hasShownWrappedSetupSupportPrompt);

	useMountEffect(() => {
		if (isVisible) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			markWrappedSetupSupportPromptShown();
			setIsVisible(true);
		}, WRAPPED_SETUP_SUPPORT_PROMPT_DELAY_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	});

	if (!isVisible) {
		return null;
	}

	return (
		<button
			type="button"
			className="mymind-wrapped-setup-support-prompt"
			onClick={() => void openChatwoot()}
		>
			Trouble uploading sessions?
		</button>
	);
}

function hasShownWrappedSetupSupportPrompt() {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return (
			window.sessionStorage.getItem(
				WRAPPED_SETUP_SUPPORT_PROMPT_STORAGE_KEY,
			) === "true"
		);
	} catch {
		return false;
	}
}

function markWrappedSetupSupportPromptShown() {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.sessionStorage.setItem(
			WRAPPED_SETUP_SUPPORT_PROMPT_STORAGE_KEY,
			"true",
		);
	} catch {}
}

function getInitialStepIndex(
	initialStepId: CliSetupStepId | undefined,
	lastStepIndex: number,
) {
	if (!initialStepId) {
		return 0;
	}

	const stepIndex = cliSetupCommands.findIndex(
		(step) => step.id === initialStepId,
	);
	if (stepIndex < 0) {
		return 0;
	}

	return Math.min(stepIndex, lastStepIndex);
}
