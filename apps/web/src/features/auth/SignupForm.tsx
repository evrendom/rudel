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
import { authClient } from "@/lib/auth-client";
import {
	captureSignUpFailed,
	normalizeWebErrorCode,
} from "@/lib/product-analytics";
import { navigateToDestination } from "./auth-navigation";
import {
	clearPendingSignupRedirect,
	getEmailSignupSuccessDestination,
	getEmailSignupVerificationCallbackURL,
	getSocialSignupRedirectOptions,
	primePendingSignupRedirect,
} from "./auth-route-utils";
import {
	recordOAuthRedirectResult,
	recordOAuthRedirectStart,
} from "./oauth-debug";

function getSignupContext() {
	const params = new URLSearchParams(window.location.search);
	const redirect = params.get("redirect");
	const userCode = params.get("user_code");
	const path = window.location.pathname;

	const entryPoint:
		| "homepage"
		| "cli_device_login"
		| "accept_invitation"
		| "direct" = userCode
		? "cli_device_login"
		: path.startsWith("/invitation/") || redirect?.includes("/invitation/")
			? "accept_invitation"
			: path === "/" || path === ""
				? "homepage"
				: "direct";

	return {
		entryPoint,
		isInviteFlow:
			path.startsWith("/invitation/") ||
			redirect?.includes("/invitation/") ||
			false,
	};
}

export function SignupForm({
	onSwitchToLogin,
}: {
	onSwitchToLogin: () => void;
}) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "signup",
	});

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);
		const successDestination = getEmailSignupSuccessDestination();
		const verificationCallbackURL = getEmailSignupVerificationCallbackURL();
		primePendingSignupRedirect(successDestination);
		let didNavigate = false;
		const navigateAfterSignup = () => {
			if (didNavigate) {
				return;
			}
			didNavigate = true;
			navigateToDestination(successDestination);
		};
		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "sign_up",
			sourceComponent: "signup_form",
			authMethod: "email_password",
			entrypoint: signupContext.entryPoint,
		});
		const { error } = await authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: verificationCallbackURL,
			fetchOptions: {
				disableSignal: true,
				onSuccess: () => {
					navigateAfterSignup();
				},
			},
		});
		setLoading(false);
		if (error) {
			clearPendingSignupRedirect();
			captureSignUpFailed({
				signup_method: "email_password",
				failure_stage: "form_submit",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setError(error.message ?? "Sign up failed");
			return;
		}

		// Better Auth's signUp.email callbackURL is only used for email verification in 1.5.4.
		navigateAfterSignup();
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setError("");
		const { callbackURL, newUserCallbackURL } =
			getSocialSignupRedirectOptions();
		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "sign_up",
			sourceComponent: "signup_form",
			authMethod: provider,
			entrypoint: signupContext.entryPoint,
		});
		recordOAuthRedirectStart({
			callbackURL,
			newUserCallbackURL,
			provider,
			source: "signup_form",
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL,
			newUserCallbackURL,
		});
		recordOAuthRedirectResult({
			errorMessage: error?.message,
			provider,
			source: "signup_form",
		});
		if (error) {
			captureSignUpFailed({
				signup_method: provider,
				failure_stage: "provider_redirect",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setError(error.message ?? `Sign up with ${provider} failed`);
		}
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Create account</CardTitle>
				<CardDescription>
					Enter your details to create a new account
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<Button type="submit" disabled={loading}>
						{loading ? "Creating account..." : "Sign up"}
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
					Already have an account?{" "}
					<button
						type="button"
						onClick={() => {
							trackAuthenticationAction({
								actionName: "open_login",
								sourceComponent: "signup_form",
							});
							onSwitchToLogin();
						}}
						className="underline underline-offset-4 hover:text-primary"
					>
						Sign in
					</button>
				</p>
			</CardContent>
		</Card>
	);
}
