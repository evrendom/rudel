import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient, refreshAuthClientState } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type FeedbackState = {
	kind: "error" | "success";
	message: string;
} | null;

function getCallbackURL(): string {
	const params = new URLSearchParams(window.location.search);
	const userCode = params.get("user_code");
	if (userCode) {
		return `/?user_code=${encodeURIComponent(userCode)}`;
	}
	const redirect = params.get("redirect");
	if (redirect) {
		return `/?redirect=${encodeURIComponent(redirect)}`;
	}
	const path = window.location.pathname;
	const search = window.location.search;
	if (path !== "/" && path !== "") {
		return `/?redirect=${encodeURIComponent(`${path}${search}`)}`;
	}
	return "/";
}

export function LoginForm({
	onSwitchToSignup,
}: {
	onSwitchToSignup: () => void;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [feedback, setFeedback] = useState<FeedbackState>(null);
	const [loading, setLoading] = useState(false);
	const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "login",
	});

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFeedback(null);
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: "email_password",
		});
		setLoading(true);
		const { error } = await authClient.signIn.email({ email, password });
		setLoading(false);
		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? "Sign in failed",
			});
			return;
		}

		refreshAuthClientState();
	}

	async function handleRequestPasswordReset() {
		if (!email.trim()) {
			const emailField = document.getElementById("email");
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setFeedback({
				kind: "error",
				message:
					"Enter your email first and we will send the reset link there.",
			});
			return;
		}

		trackAuthenticationAction({
			actionName: "request_password_reset",
			sourceComponent: "login_form",
			authMethod: "email_password",
		});
		setFeedback(null);
		setRequestingPasswordReset(true);
		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/reset-password`,
		});
		setRequestingPasswordReset(false);

		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? "Could not send password reset email",
			});
			return;
		}

		setFeedback({
			kind: "success",
			message: `If an account exists for ${email.trim()}, a reset link is on its way.`,
		});
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setFeedback(null);
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: provider,
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL: getCallbackURL(),
		});
		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? `Sign in with ${provider} failed`,
			});
		}
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Sign in</CardTitle>
				<CardDescription>
					Enter your credentials to access your account
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value);
								if (feedback) {
									setFeedback(null);
								}
							}}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-3">
							<Label htmlFor="password">Password</Label>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={() => {
									void handleRequestPasswordReset();
								}}
								disabled={requestingPasswordReset}
								className="text-muted-foreground hover:text-foreground"
							>
								{requestingPasswordReset
									? "Sending link..."
									: feedback?.kind === "success"
										? "Resend link"
										: "Forgot password?"}
							</Button>
						</div>
						<Input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => {
								setPassword(e.target.value);
								if (feedback?.kind === "error") {
									setFeedback(null);
								}
							}}
							required
						/>
					</div>
					{feedback ? (
						<div
							role={feedback.kind === "error" ? "alert" : "status"}
							aria-live="polite"
							className={cn(
								"rounded-3xl px-3 py-2 text-sm leading-5 ring-1",
								feedback.kind === "error"
									? "bg-destructive/5 text-destructive ring-destructive/15"
									: "bg-muted/35 text-muted-foreground ring-border/60",
							)}
						>
							{feedback.message}
						</div>
					) : null}
					<Button type="submit" disabled={loading || requestingPasswordReset}>
						{loading ? "Signing in..." : "Sign in"}
					</Button>
				</form>

				<div className="flex items-center gap-2">
					<Separator className="flex-1" />
					<span className="text-xs text-muted-foreground">OR</span>
					<Separator className="flex-1" />
				</div>

				<div className="flex flex-col gap-2">
					<Button
						variant="outline"
						onClick={() => handleSocialSignIn("google")}
					>
						Continue with Google
					</Button>
					<Button
						variant="outline"
						onClick={() => handleSocialSignIn("github")}
					>
						Continue with GitHub
					</Button>
				</div>

				<p className="text-center text-xs text-muted-foreground">
					By signing up, you agree to our{" "}
					<a
						href="https://rudel.ai/terms"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-4 hover:text-primary"
					>
						Terms of Service
					</a>{" "}
					and{" "}
					<a
						href="https://obsessiondb.com/privacy"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-4 hover:text-primary"
					>
						Privacy Policy
					</a>
				</p>

				<p className="text-center text-sm text-muted-foreground">
					Don&apos;t have an account?{" "}
					<button
						type="button"
						onClick={() => {
							trackAuthenticationAction({
								actionName: "open_signup",
								sourceComponent: "login_form",
							});
							onSwitchToSignup();
						}}
						className="underline underline-offset-4 hover:text-primary"
					>
						Sign up
					</button>
				</p>
			</CardContent>
		</Card>
	);
}
