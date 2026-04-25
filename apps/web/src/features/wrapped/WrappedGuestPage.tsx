import type { ReactNode } from "react";
import { useState } from "react";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { WrappedAuthFlow } from "./WrappedAuthFlow";
import { WrappedCardProfileStep } from "./WrappedCardProfileStep";
import { WrappedDesktopResumePreviewStage } from "./WrappedDesktopResumePreviewStage";
import { WrappedSetupPage } from "./WrappedSetupPage";
import {
	buildLocalWrappedGuestPreviewProfile,
	readWrappedGuestPreviewSnapshot,
	type WrappedGuestFlowStep,
	type WrappedGuestPreviewProfile,
	writeWrappedGuestPreviewSnapshot,
} from "./wrapped-guest-preview";

type WrappedGuestPageStep =
	| "auth"
	| "profile"
	| "setup-preview"
	| "mobile-preview";

export function WrappedGuestPage(props: {
	authFormCardScale?: number;
	authIntroCardScale?: number;
	debugControls?: ReactNode;
}) {
	const { authFormCardScale, authIntroCardScale, debugControls } = props;
	const isMobile = useIsMobile();
	const [initialSnapshot] = useState(() => readWrappedGuestPreviewSnapshot());
	const [step, setStep] = useState<WrappedGuestPageStep>(
		getInitialWrappedGuestPageStep(initialSnapshot?.step),
	);
	const [previewProfile, setPreviewProfile] =
		useState<WrappedGuestPreviewProfile | null>(
			initialSnapshot?.profile ?? null,
		);

	function handlePreviewEmailPasswordSubmit(email: string) {
		const nextProfile =
			previewProfile ??
			buildLocalWrappedGuestPreviewProfile(getEmailHandle(email));

		if (nextProfile) {
			setPreviewProfile(nextProfile);
			writeWrappedGuestPreviewSnapshot({
				profile: nextProfile,
				step: "profile",
			});
		}

		setStep("profile");
	}

	function handleProfileDisplayNameChange(nextValue: string) {
		updatePreviewProfile({ displayName: nextValue });
	}

	function handleProfileImageChange(nextValue: string | null) {
		updatePreviewProfile({ imageUrl: nextValue });
	}

	function handleBackToAuth() {
		if (previewProfile) {
			writeWrappedGuestPreviewSnapshot({
				profile: previewProfile,
				step: "auth",
			});
		}

		setStep("auth");
	}

	function handleContinueFromProfile() {
		const normalizedProfile = previewProfile
			? {
					...previewProfile,
					displayName: previewProfile.displayName.trim(),
				}
			: null;

		if (!normalizedProfile?.displayName) {
			return;
		}

		setPreviewProfile(normalizedProfile);
		writeWrappedGuestPreviewSnapshot({
			profile: normalizedProfile,
			step: "profile",
		});
		setStep(isMobile ? "mobile-preview" : "setup-preview");
	}

	function updatePreviewProfile(
		updates: Partial<
			Pick<WrappedGuestPreviewProfile, "displayName" | "imageUrl">
		>,
	) {
		const nextProfile =
			previewProfile ?? buildLocalWrappedGuestPreviewProfile("you");

		if (!nextProfile) {
			return;
		}

		const updatedProfile = {
			...nextProfile,
			...updates,
		};

		setPreviewProfile(updatedProfile);

		if (updatedProfile.displayName.trim()) {
			writeWrappedGuestPreviewSnapshot({
				profile: updatedProfile,
				step: "profile",
			});
		}
	}

	if (step === "mobile-preview") {
		return <WrappedDesktopResumePreviewStage debugControls={debugControls} />;
	}

	if (step === "setup-preview") {
		return <WrappedSetupPage debugControls={debugControls} />;
	}

	if (step === "profile") {
		return (
			<WrappedCardProfileStep
				debugControls={debugControls}
				displayName={previewProfile?.displayName ?? ""}
				imageUrl={previewProfile?.imageUrl ?? null}
				isComplete={Boolean(previewProfile?.displayName.trim())}
				onBack={handleBackToAuth}
				onContinue={handleContinueFromProfile}
				onDisplayNameChange={handleProfileDisplayNameChange}
				onImageChange={handleProfileImageChange}
				previewProfile={previewProfile}
			/>
		);
	}

	if (step === "auth") {
		return (
			<WrappedAuthFlow
				authFormCardScale={authFormCardScale}
				authIntroCardScale={authIntroCardScale}
				debugControls={debugControls}
				onEmailPasswordPreviewSubmit={handlePreviewEmailPasswordSubmit}
				previewProfile={previewProfile}
			/>
		);
	}
}

function getInitialWrappedGuestPageStep(
	step: WrappedGuestFlowStep | undefined,
): WrappedGuestPageStep {
	return step === "profile" ? "profile" : "auth";
}

function getEmailHandle(email: string) {
	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || "you";
}
