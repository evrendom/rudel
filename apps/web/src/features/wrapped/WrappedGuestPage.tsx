import { useState } from "react";
import { WrappedAuthFlow } from "./WrappedAuthFlow";
import { WrappedXHandleStep } from "./WrappedXHandleStep";
import {
	buildLocalWrappedGuestPreviewProfile,
	clearWrappedGuestPreviewSnapshot,
	isWrappedGuestUsernameValid,
	readWrappedGuestPreviewSnapshot,
	type WrappedGuestFlowStep,
	type WrappedGuestPreviewProfile,
	writeWrappedGuestPreviewSnapshot,
} from "./wrapped-guest-preview";

export function WrappedGuestPage() {
	const [initialSnapshot] = useState(() => readWrappedGuestPreviewSnapshot());
	const [step, setStep] = useState<WrappedGuestFlowStep>(
		initialSnapshot?.step ?? "x-handle",
	);
	const [handleValue, setHandleValue] = useState(
		initialSnapshot?.profile ? `@${initialSnapshot.profile.username}` : "",
	);
	const [previewProfile, setPreviewProfile] =
		useState<WrappedGuestPreviewProfile | null>(initialSnapshot?.profile ?? null);

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

	function handleBackToHandleStep() {
		setStep("x-handle");
		clearWrappedGuestPreviewSnapshot();
	}

	if (step === "auth") {
		return (
			<WrappedAuthFlow
				onBackToHandleStep={handleBackToHandleStep}
				previewProfile={previewProfile}
			/>
		);
	}

	return (
		<WrappedXHandleStep
			handleValue={handleValue}
			isHandleValid={isWrappedGuestUsernameValid(handleValue)}
			onContinue={handleContinueToAuth}
			onHandleChange={handleXHandleChange}
			previewProfile={previewProfile}
		/>
	);
}
