import { AppRouter } from "@/app/AppRouter";

export function AuthenticatedApp({
	rootRedirectTarget,
	session,
}: {
	rootRedirectTarget: string | null;
	session: unknown;
}) {
	return (
		<AppRouter rootRedirectTarget={rootRedirectTarget} session={session} />
	);
}
