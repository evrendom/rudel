import type { ReactNode } from "react";
import { useState } from "react";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import { client } from "@/lib/orpc";
import { WrappedDesktopResumePromptStage } from "./WrappedDesktopResumePromptStage";

interface WrappedDesktopResumePromptPageProps {
	createResumeLink?: (input: { shareId: string | null }) => Promise<{
		email_sent: boolean;
		expires_at: string;
		resume_url: string;
	}>;
	debugControls?: ReactNode;
	email: string;
	shareId: string | null;
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
	} = props;
	const [state, setState] = useState<ResumePromptState>({
		status: "idle",
	});
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const isSubmitting = state.status === "pending";

	async function handleEmailDesktopLink() {
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
		<WrappedDesktopResumePromptStage
			description={
				<>
					Uploading Rudel sessions still needs desktop, so we'll send a secure
					resume link to{" "}
					<strong className="font-semibold text-[#22201f]">{email}</strong>.
				</>
			}
			debugControls={debugControls}
			feedback={
				<>
					{state.status === "error" ? (
						<p className="mymind-wrapped-entry-card__feedback is-error">
							{state.message}
						</p>
					) : null}

					{state.status === "ready" ? (
						<div className="mymind-wrapped-entry-card__feedback is-success">
							<p className="mymind-wrapped-entry-card__feedback-copy">
								{state.emailSent
									? `We sent the desktop link to ${email}.`
									: "Email sending is unavailable right now, so we're showing the desktop link directly below."}
							</p>
							<p className="mymind-wrapped-entry-card__feedback-copy">
								This link expires {formatResumeExpiry(state.expiresAt)}.
							</p>
							<a
								className="mymind-wrapped-entry-card__link"
								href={state.resumeUrl}
							>
								{state.resumeUrl}
							</a>
						</div>
					) : null}
				</>
			}
			primaryAction={
				<WrappedPrimaryAction
					kind="button"
					onClick={handleEmailDesktopLink}
				>
					{isSubmitting ? "Sending desktop link..." : "Email me a desktop link"}
				</WrappedPrimaryAction>
			}
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
