import { useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";

type GuestPage = "login" | "signup";
const APP_LOGO_SRC = "/logo-dark.svg";

export function GuestApp() {
	const [page, setPage] = useState<GuestPage>("login");

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6">
			<img src={APP_LOGO_SRC} alt="Rudel" className="h-10 w-10" />
			{page === "login" ? (
				<LoginForm onSwitchToSignup={() => setPage("signup")} />
			) : (
				<SignupForm onSwitchToLogin={() => setPage("login")} />
			)}
		</div>
	);
}
