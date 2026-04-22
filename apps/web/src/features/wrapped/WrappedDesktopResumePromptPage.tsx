import { useState } from "react";
import { Button } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { client } from "@/lib/orpc";
import { WrappedRouteStageShell } from "./route-stage-shell";

interface WrappedDesktopResumePromptPageProps {
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
	const { email, shareId } = props;
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
			const result = await client.wrappedResume.create({
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
		<WrappedRouteStageShell
			description={
				<>
					Uploading Geneva sessions still needs desktop, so we'll send a secure
					resume link to{" "}
					<strong className="font-semibold text-[#22201f]">{email}</strong>.
				</>
			}
			eyebrow="Mobile handoff"
			stage={
				<div className="mymind-wrapped-entry-card">
					<div className="mymind-wrapped-entry-card__section">
						<p className="mymind-wrapped-entry-card__section-eyebrow">
							What happens next
						</p>
						<ol className="mymind-wrapped-entry-card__list">
							<li>1. Tap the button below on your phone.</li>
							<li>2. Open the emailed link on your desktop.</li>
							<li>3. Upload your sessions there and continue normally.</li>
						</ol>
					</div>

					<div className="mymind-wrapped-action-stack">
						<Button
							type="button"
							className="mymind-wrapped-entry-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
							onClick={handleEmailDesktopLink}
						>
							{isSubmitting
								? "Sending desktop link..."
								: "Email me a desktop link"}
						</Button>

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
					</div>
				</div>
			}
			status="Continue on desktop"
			title="Continue setup on desktop"
			titleClassName="max-w-[11ch]"
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
