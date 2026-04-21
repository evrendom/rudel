import { useState } from "react";
import { Navigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
} from "@/features/auth/auth-route-utils";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/orpc";

interface WrappedDesktopResumePageProps {
	token: string;
}

type ResumeConsumeState =
	| { status: "idle" | "pending" }
	| {
			message: string;
			status: "error";
	  }
	| {
			redirectTo: string;
			status: "ready";
	  };

// This route exists only to redeem the emailed desktop link. It intentionally
// does not render the wrapped story itself. Its job is to re-enter the signed-in
// user at the correct desktop setup path and then get out of the way.
export function WrappedDesktopResumePage(props: WrappedDesktopResumePageProps) {
	const { token } = props;
	const { data: session, isPending } = authClient.useSession();
	const [state, setState] = useState<ResumeConsumeState>({
		status: "idle",
	});
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "get_started",
	});
	const resumePath = appRoutes.wrappedResume(token);

	useEffectOnceWhen({
		effect: () => {
			void consumeResumeToken({
				session,
				setState,
				token,
				trackResumeClaimed: (shareId) => {
					trackUtilityUsed({
						sourceComponent: "wrapped_desktop_resume_page",
						targetId: shareId ?? undefined,
						utilityName: "resumeClaimed",
						utilityState: "consumed",
					});
				},
			});
		},
		isReady: !isPending && !!session,
		key: token,
	});

	if (isPending) {
		return (
			<ResumeStateScreen body="Checking your account before continuing…" />
		);
	}

	if (!session) {
		return (
			<Navigate replace to={`/?redirect=${encodeURIComponent(resumePath)}`} />
		);
	}

	if (state.status === "ready") {
		return <Navigate replace to={state.redirectTo} />;
	}

	if (state.status === "error") {
		return (
			<ResumeStateScreen
				body={state.message}
				title="Desktop link unavailable"
			/>
		);
	}

	return <ResumeStateScreen body="Preparing your desktop setup step…" />;
}

async function consumeResumeToken(input: {
	session: AppSession | null;
	setState: (state: ResumeConsumeState) => void;
	token: string;
	trackResumeClaimed: (shareId: string | null) => void;
}) {
	const { session, setState, token, trackResumeClaimed } = input;
	const email = getSessionUserEmail(session);

	if (!email) {
		setState({
			message:
				"This account is missing an email address, so the desktop link cannot be verified.",
			status: "error",
		});
		return;
	}

	setState({ status: "pending" });

	try {
		const result = await client.wrappedResume.consume({
			token,
		});

		trackResumeClaimed(result.share_id);
		setState({
			redirectTo: result.redirect_to,
			status: "ready",
		});
	} catch (error) {
		setState({
			message: getResumeConsumeErrorMessage(error),
			status: "error",
		});
	}
}

function ResumeStateScreen(props: { body: string; title?: string }) {
	const { body, title = "Continuing on desktop" } = props;

	return (
		<section className="flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-xl space-y-3 text-center">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
					Geneva setup
				</p>
				<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
					{title}
				</h1>
				<p className="text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
					{body}
				</p>
			</div>
		</section>
	);
}

function getResumeConsumeErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return "This desktop link could not be used. Please request a new one from your phone.";
}
