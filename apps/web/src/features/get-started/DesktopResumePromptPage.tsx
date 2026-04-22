import { useState } from "react";
import { buttonVariants } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { client } from "@/lib/orpc";
import { cn } from "@/lib/utils";

interface DesktopResumePromptPageProps {
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

// This page is the mobile-only upload handoff. Mobile users can still view the
// public replay, the wrapped story, and the final card. We only stop them here,
// right before session upload, because upload is the one step that still needs
// desktop today.
export function DesktopResumePromptPage(props: DesktopResumePromptPageProps) {
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
		<section className="flex min-h-screen items-center bg-background px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-2xl space-y-8 text-center">
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
						Continue on desktop
					</p>
					<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
						Continue setup on desktop
					</h1>
					<p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
						You can keep viewing your Wrapped story and final card on mobile.
						Uploading Geneva sessions still needs desktop, so we’ll send a
						secure resume link to{" "}
						<strong className="text-foreground">{email}</strong>.
					</p>
				</div>

				<div className="space-y-4 rounded-3xl border border-border/70 bg-card px-5 py-6 text-left shadow-sm sm:px-6">
					<div className="space-y-2">
						<h2 className="text-sm font-semibold text-foreground">
							What happens next
						</h2>
						<ol className="space-y-2 text-sm leading-6 text-muted-foreground">
							<li>1. Tap the button below on your phone.</li>
							<li>2. Open the emailed link on your desktop.</li>
							<li>3. Upload your sessions there and continue normally.</li>
						</ol>
					</div>

					<button
						className={cn(
							buttonVariants({ size: "lg" }),
							"w-full rounded-full",
						)}
						onClick={handleEmailDesktopLink}
						type="button"
					>
						{isSubmitting
							? "Sending desktop link..."
							: "Email me a desktop link"}
					</button>

					{state.status === "error" ? (
						<p className="text-sm leading-6 text-destructive">
							{state.message}
						</p>
					) : null}

					{state.status === "ready" ? (
						<div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-4">
							<p className="text-sm leading-6 text-muted-foreground">
								{state.emailSent
									? `We sent the desktop link to ${email}.`
									: "Email sending is unavailable right now, so we are showing the desktop link directly below."}
							</p>
							<p className="text-sm leading-6 text-muted-foreground">
								This link expires {formatResumeExpiry(state.expiresAt)}.
							</p>
							<a
								className="block break-all text-sm font-medium text-foreground underline underline-offset-4"
								href={state.resumeUrl}
							>
								{state.resumeUrl}
							</a>
						</div>
					) : null}
				</div>
			</div>
		</section>
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
