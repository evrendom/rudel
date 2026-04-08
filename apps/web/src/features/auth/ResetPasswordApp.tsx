import { useTheme } from "next-themes";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

export function ResetPasswordApp() {
	const { resolvedTheme } = useTheme();
	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6">
			<img src={logoSrc} alt="Rudel" className="h-10 w-10" />
			<ResetPasswordForm onBackToLogin={() => (window.location.href = "/")} />
		</div>
	);
}
