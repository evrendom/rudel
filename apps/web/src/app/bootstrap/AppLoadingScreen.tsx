export function AppLoadingScreen({
	message = "Loading…",
}: {
	message?: string;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<p className="text-muted-foreground">{message}</p>
		</div>
	);
}
