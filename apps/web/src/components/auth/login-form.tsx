import { useState } from "react";
import { useUiControlTracking } from "../../hooks/useDashboardAnalytics";
import { authClient } from "../../lib/auth-client";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";

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
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const { trackUiControl } = useUiControlTracking({ pageName: "login" });

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		trackUiControl({
			controlName: "email_password_submit",
			controlType: "button",
			interactionType: "submit",
		});
		setError("");
		setLoading(true);
		const { error } = await authClient.signIn.email({ email, password });
		setLoading(false);
		if (error) {
			setError(error.message ?? "Sign in failed");
		}
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setError("");
		trackUiControl({
			controlName: `${provider}_sign_in`,
			controlType: "button",
			interactionType: "click",
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL: getCallbackURL(),
		});
		if (error) {
			setError(error.message ?? `Sign in with ${provider} failed`);
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
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<Button type="submit" disabled={loading}>
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
							trackUiControl({
								controlName: "switch_to_signup",
								controlType: "button",
								interactionType: "navigate",
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
