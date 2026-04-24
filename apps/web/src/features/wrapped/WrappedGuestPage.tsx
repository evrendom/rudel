import type { ReactNode } from "react";
import { useState } from "react";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { WrappedAuthFlow } from "./WrappedAuthFlow";
import { WrappedDesktopResumePreviewStage } from "./WrappedDesktopResumePreviewStage";
import { WrappedSetupPage } from "./WrappedSetupPage";
import { WrappedXHandleStep } from "./WrappedXHandleStep";
import {
	buildLocalWrappedGuestPreviewProfile,
	isWrappedGuestUsernameValid,
	readWrappedGuestPreviewSnapshot,
	type WrappedGuestFlowStep,
	type WrappedGuestPreviewProfile,
	writeWrappedGuestPreviewSnapshot,
} from "./wrapped-guest-preview";

type WrappedGuestPageStep =
	| WrappedGuestFlowStep
	| "setup-preview"
	| "mobile-preview";

export function WrappedGuestPage(props: { debugControls?: ReactNode }) {
	const { debugControls } = props;
	const isMobile = useIsMobile();
	const [initialSnapshot] = useState(() => readWrappedGuestPreviewSnapshot());
	const [step, setStep] = useState<WrappedGuestPageStep>(
		initialSnapshot?.step ?? "x-handle",
	);
	const [handleValue, setHandleValue] = useState(
		initialSnapshot?.profile ? `@${initialSnapshot.profile.username}` : "",
	);
	const [previewProfile, setPreviewProfile] =
		useState<WrappedGuestPreviewProfile | null>(
			initialSnapshot?.profile ?? null,
		);

	function handleXHandleChange(nextValue: string) {
		setHandleValue(nextValue);
		setPreviewProfile(buildLocalWrappedGuestPreviewProfile(nextValue));
	}

	function handleContinueToAuth() {
		const localPreviewProfile =
			buildLocalWrappedGuestPreviewProfile(handleValue) ?? previewProfile;

		if (!localPreviewProfile) {
			return;
		}

		setHandleValue(`@${localPreviewProfile.username}`);
		setPreviewProfile(localPreviewProfile);
		setStep("auth");
		writeWrappedGuestPreviewSnapshot({
			profile: localPreviewProfile,
			step: "auth",
		});
	}

	function handlePreviewEmailPasswordSubmit(_email: string) {
		setStep(isMobile ? "mobile-preview" : "setup-preview");
	}

	if (step === "mobile-preview") {
		return <WrappedDesktopResumePreviewStage debugControls={debugControls} />;
	}

	if (step === "setup-preview") {
		return <WrappedSetupPage debugControls={debugControls} />;
	}

	if (step === "auth") {
		return (
			<WrappedAuthFlow
				debugControls={debugControls}
				onEmailPasswordPreviewSubmit={handlePreviewEmailPasswordSubmit}
				previewProfile={previewProfile}
			/>
		);
	}

	return (
		<WrappedXHandleStep
			debugControls={debugControls}
			handleValue={handleValue}
			isHandleValid={isWrappedGuestUsernameValid(handleValue)}
			onContinue={handleContinueToAuth}
			onHandleChange={handleXHandleChange}
			previewProfile={previewProfile}
		/>
	);
}
