import type { ReactNode } from "react";
import { useState } from "react";
import { readPendingEmailCodeDraft } from "@/features/auth/email-code-auth";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";

type Page = "login" | "signup";

interface GuestAppProps {
	description?: ReactNode;
	eyebrow?: string;
	showLogo?: boolean;
	title?: string;
}

export function GuestApp(props: GuestAppProps = {}) {
	const { description, eyebrow, showLogo = true, title } = props;
	const [page, setPage] = useState<Page>(
		() => readPendingEmailCodeDraft()?.mode ?? "signup",
	);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6">
			{showLogo ? (
				<img src="/favicon-light.svg" alt="Rudel" className="h-10 w-10" />
			) : null}
			{eyebrow || title || description ? (
				<div className="max-w-2xl space-y-3 px-4 text-center">
					{eyebrow ? (
						<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
							{eyebrow}
						</p>
					) : null}
					{title ? (
						<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
							{title}
						</h1>
					) : null}
					{description ? (
						<p className="text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
							{description}
						</p>
					) : null}
				</div>
			) : null}
			{page === "login" ? (
				<LoginForm onSwitchToSignup={() => setPage("signup")} />
			) : (
				<SignupForm onSwitchToLogin={() => setPage("login")} />
			)}
		</div>
	);
}
