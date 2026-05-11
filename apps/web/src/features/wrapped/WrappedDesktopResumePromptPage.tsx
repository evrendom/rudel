import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { client } from "@/lib/orpc";
import { WrappedDesktopResumePreviewStage } from "./WrappedDesktopResumePreviewStage";

const DESKTOP_LINK_MOTION_PREVIEW_DURATION_MS = 820;

interface WrappedDesktopResumePromptPageProps {
	createResumeLink?: (input: { shareId: string | null }) => Promise<{
		email_sent: boolean;
		expires_at: string;
		resume_url: string;
	}>;
	debugControls?: ReactNode;
	email: string;
	shareId: string | null;
	shouldBypassEmailSendForMotionPreview?: boolean;
}

type ResumePromptState =
	| { status: "idle" }
	| { status: "pending" }
	| {
			emailSent: boolean;
			expiresAt: string;
			resumeUrl: string;
			status: "ready";
	  }
	| {
			message: string;
			status: "error";
	  };

export function WrappedDesktopResumePromptPage(
	props: WrappedDesktopResumePromptPageProps,
) {
	const {
		createResumeLink = client.wrappedResume.create,
		debugControls,
		email,
		shareId,
		shouldBypassEmailSendForMotionPreview = false,
	} = props;
	const [state, setState] = useState<ResumePromptState>({
		status: "idle",
	});
	const [previewPrimaryActionState, setPreviewPrimaryActionState] = useState<
		"idle" | "pending" | "success"
	>("idle");
	const previewTimeoutRef = useRef<number | null>(null);
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const isSubmitting = state.status === "pending";
	const isPreviewBypassEnabled = shouldBypassEmailSendForMotionPreview;
	const primaryActionState = isPreviewBypassEnabled
		? previewPrimaryActionState
		: state.status === "ready"
			? "success"
			: isSubmitting
				? "pending"
				: "idle";
	const shouldDisablePrimaryAction = isPreviewBypassEnabled
		? primaryActionState !== "idle"
		: isSubmitting || state.status === "ready";
	const extraFeedback = isPreviewBypassEnabled ? undefined : state.status ===
		"error" ? (
		<p className="mymind-wrapped-entry-card__feedback is-error">
			{state.message}
		</p>
	) : state.status === "ready" ? (
		<div className="mymind-wrapped-entry-card__feedback is-success">
			<p className="mymind-wrapped-entry-card__feedback-copy">
				{state.emailSent
					? `We sent the desktop link to ${email}.`
					: "Email sending is unavailable right now, so use Copy instead."}
			</p>
			<p className="mymind-wrapped-entry-card__feedback-copy">
				This link expires {formatResumeExpiry(state.expiresAt)}.
			</p>
		</div>
	) : undefined;

	useMountEffect(() => {
		return () => {
			if (previewTimeoutRef.current !== null) {
				window.clearTimeout(previewTimeoutRef.current);
			}
		};
	});

	async function handleEmailDesktopLink() {
		if (isPreviewBypassEnabled) {
			if (previewPrimaryActionState !== "idle") {
				return;
			}

			if (previewTimeoutRef.current !== null) {
				window.clearTimeout(previewTimeoutRef.current);
			}

			setPreviewPrimaryActionState("pending");
			previewTimeoutRef.current = window.setTimeout(() => {
				setPreviewPrimaryActionState("success");
				previewTimeoutRef.current = null;
			}, DESKTOP_LINK_MOTION_PREVIEW_DURATION_MS);
			return;
		}

		if (isSubmitting) {
			return;
		}

		setState({ status: "pending" });

		try {
			const result = await createResumeLink({
				shareId,
			});

			trackUtilityUsed({
				entrySource: "mobile_get_started",
				shareId: shareId ?? undefined,
				sourceComponent: "desktop_resume_prompt_page",
				targetId: shareId ?? undefined,
				utilityName: "desktopLinkSent",
				utilityState: result.email_sent ? "emailSent" : "linkReady",
			});

			setState({
				emailSent: result.email_sent,
				expiresAt: result.expires_at,
				resumeUrl: result.resume_url,
				status: "ready",
			});
		} catch (error) {
			setState({
				message: getResumePromptErrorMessage(error),
				status: "error",
			});
		}
	}

	return (
		<WrappedDesktopResumePreviewStage
			copyValue={state.status === "ready" ? state.resumeUrl : undefined}
			debugControls={debugControls}
			extraFeedback={extraFeedback}
			isPrimaryActionDisabled={shouldDisablePrimaryAction}
			onPrimaryAction={() => {
				void handleEmailDesktopLink();
			}}
			primaryActionLabel={
				primaryActionState === "success"
					? "Email sent!"
					: "Send link to my mail"
			}
			primaryActionState={primaryActionState}
		/>
	);
}

function formatResumeExpiry(expiresAt: string) {
	const parsedDate = new Date(expiresAt);

	if (Number.isNaN(parsedDate.getTime())) {
		return "soon";
	}

	return parsedDate.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function getResumePromptErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return "We could not create the desktop link. Please try again.";
}
