import { ResetPasswordForm } from "@/components/auth/reset-password-form";

const APP_LOGO_SRC = "/logo-dark.svg";

export function ResetPasswordApp() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6">
			<img src={APP_LOGO_SRC} alt="Rudel" className="h-10 w-10" />
			<ResetPasswordForm onBackToLogin={() => (window.location.href = "/")} />
		</div>
	);
}
