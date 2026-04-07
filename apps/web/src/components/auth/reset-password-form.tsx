import { useState } from "react";
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

export function ResetPasswordForm({
	onBackToLogin,
}: {
	onBackToLogin: () => void;
}) {
	const token = new URLSearchParams(window.location.search).get("token");
	const invalidToken = new URLSearchParams(window.location.search).get("error");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(
		invalidToken ? "This reset link is invalid or expired." : "",
	);
	const [successMessage, setSuccessMessage] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!token) {
			setError("This reset link is invalid or expired.");
			return;
		}
		setError("");
		setSuccessMessage("");
		setLoading(true);
		const { error } = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setLoading(false);

		if (error) {
			setError(error.message ?? "Password reset failed");
			return;
		}

		setSuccessMessage("Your password has been reset. You can now sign in.");
		setPassword("");
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Reset password</CardTitle>
				<CardDescription>Enter your new password</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-password">New password</Label>
						<Input
							id="new-password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{successMessage && (
						<p className="text-sm text-muted-foreground">{successMessage}</p>
					)}
					<Button type="submit" disabled={loading || !token}>
						{loading ? "Resetting password..." : "Reset password"}
					</Button>
				</form>

				<button
					type="button"
					onClick={onBackToLogin}
					className="text-left text-sm underline underline-offset-4 hover:text-primary"
				>
					Back to sign in
				</button>
			</CardContent>
		</Card>
	);
}
