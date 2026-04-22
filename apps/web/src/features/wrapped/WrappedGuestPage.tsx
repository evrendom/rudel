import { useState } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import { WrappedRouteStageShell } from "./route-stage-shell";

type WrappedGuestPageTab = "login" | "signup";

export function WrappedGuestPage() {
	const [tab, setTab] = useState<WrappedGuestPageTab>("signup");
	const isLoginTab = tab === "login";

	return (
		<WrappedRouteStageShell
			stage={
				<div className="mymind-wrapped-auth-panel">
					{isLoginTab ? (
						<LoginForm
							onSwitchToSignup={() => setTab("signup")}
							variant="wrapped-story"
						/>
					) : (
						<SignupForm
							onSwitchToLogin={() => setTab("login")}
							variant="wrapped-story"
						/>
					)}
				</div>
			}
			status="Geneva Wrapped"
			title={isLoginTab ? "Sign in" : "Create your account"}
		/>
	);
}
