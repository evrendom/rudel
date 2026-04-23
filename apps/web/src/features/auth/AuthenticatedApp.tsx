import { AppRouter } from "@/app/AppRouter";

export function AuthenticatedApp({
	rootRedirectTarget,
}: {
	rootRedirectTarget: string | null;
}) {
	return <AppRouter rootRedirectTarget={rootRedirectTarget} />;
}
