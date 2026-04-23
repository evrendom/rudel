import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { WrappedRouteStageShell } from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

type WrappedAuthMode = "login" | "signup" | null;

const WRAPPED_AUTH_INTRO_TITLE = (
	<span className="mymind-wrapped-auth-intro-title">
		<span className="mymind-wrapped-auth-intro-title__line">
			Find out what your
		</span>
		<span className="mymind-wrapped-auth-intro-title__line">
			Claude Code / Codex
		</span>
		<span className="mymind-wrapped-auth-intro-title__line">
			sessions tell about you
		</span>
	</span>
);

interface WrappedAuthFlowProps {
	onBackToHandleStep?: () => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

interface WrappedAuthIntentProps {
	onChooseMode: (mode: Exclude<WrappedAuthMode, null>) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

function WrappedAuthIntent(props: WrappedAuthIntentProps) {
	const { onChooseMode, previewProfile } = props;

	return (
		<div className="mymind-wrapped-auth-panel mymind-wrapped-auth-panel--intro">
			<WrappedGuestPreviewCard profile={previewProfile} />
			<div className="mymind-wrapped-auth-panel__actions">
				<WrappedPrimaryAction
					kind="button"
					onClick={() => onChooseMode("signup")}
				>
					Create account
				</WrappedPrimaryAction>
				<WrappedSecondaryAction onClick={() => onChooseMode("login")}>
					Log in
				</WrappedSecondaryAction>
			</div>
		</div>
	);
}

export function WrappedAuthFlow(props: WrappedAuthFlowProps) {
	const { onBackToHandleStep, previewProfile } = props;
	const [mode, setMode] = useState<WrappedAuthMode>(null);

	return (
		<WrappedRouteStageShell
			description={getWrappedAuthDescription(mode, previewProfile)}
			leadingControl={renderWrappedAuthLeadingControl({
				mode,
				onBackToHandleStep,
				setMode,
			})}
			objectClassName={
				mode
					? "mymind-wrapped-entry-stage__object--auth"
					: "mymind-wrapped-entry-stage__object--auth-intro"
			}
			stage={renderWrappedAuthStage(mode, previewProfile, setMode)}
			stageClassName="mymind-wrapped-entry-stage--auth"
			title={getWrappedAuthTitle(mode)}
			titleClassName={
				mode ? undefined : "mymind-wrapped-entry-stage__headline--auth-intro"
			}
		/>
	);
}

function renderWrappedAuthLeadingControl(input: {
	mode: WrappedAuthMode;
	onBackToHandleStep?: () => void;
	setMode: (mode: WrappedAuthMode) => void;
}) {
	const { mode, onBackToHandleStep, setMode } = input;

	if (mode) {
		return (
			<button
				type="button"
				aria-label="Go back"
				className="mymind-wrapped-back-button rounded-full transition-colors"
				onClick={() => setMode(null)}
			>
				<ArrowLeft className="size-4" />
			</button>
		);
	}

	if (!onBackToHandleStep) {
		return null;
	}

	return (
		<button
			type="button"
			aria-label="Go back"
			className="mymind-wrapped-back-button rounded-full transition-colors"
			onClick={onBackToHandleStep}
		>
			<ArrowLeft className="size-4" />
		</button>
	);
}

function renderWrappedAuthStage(
	mode: WrappedAuthMode,
	previewProfile: WrappedGuestPreviewProfile | null,
	setMode: (mode: WrappedAuthMode) => void,
) {
	if (mode === "login") {
		return (
			<LoginForm
				variant="wrapped-story"
				onSwitchToSignup={() => setMode("signup")}
			/>
		);
	}

	if (mode === "signup") {
		return (
			<SignupForm
				variant="wrapped-story"
				onSwitchToLogin={() => setMode("login")}
			/>
		);
	}

	return (
		<WrappedAuthIntent onChooseMode={setMode} previewProfile={previewProfile} />
	);
}

function getWrappedAuthDescription(
	mode: WrappedAuthMode,
	previewProfile: WrappedGuestPreviewProfile | null,
) {
	if (mode === "login") {
		return "Use your Rudel account to continue.";
	}

	if (mode === "signup") {
		return "Create your Rudel account to continue.";
	}

	if (!previewProfile) {
		return "Save the preview to your Rudel account before the full story starts.";
	}

	return `Save @${previewProfile.username} to your Rudel account before the full story starts.`;
}

function getWrappedAuthTitle(mode: WrappedAuthMode) {
	if (mode === "login") {
		return "Log in";
	}

	if (mode === "signup") {
		return "Create account";
	}

	return WRAPPED_AUTH_INTRO_TITLE;
}
