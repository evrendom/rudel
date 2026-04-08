import { useTheme } from "next-themes";
import { useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";

type GuestPage = "login" | "signup";

export function GuestApp() {
	const [page, setPage] = useState<GuestPage>("login");
	const { resolvedTheme } = useTheme();
	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6">
			<img src={logoSrc} alt="Rudel" className="h-10 w-10" />
			{page === "login" ? (
				<LoginForm onSwitchToSignup={() => setPage("signup")} />
			) : (
				<SignupForm onSwitchToLogin={() => setPage("login")} />
			)}
		</div>
	);
}
