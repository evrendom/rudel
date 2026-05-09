export function AppLoadingScreen({
	message = "Loading…",
}: {
	message?: string;
}) {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="flex min-h-svh items-center justify-center bg-white text-[#292A2F]"
		>
			<img
				src="/favicon-light.svg"
				alt=""
				aria-hidden="true"
				className="h-12 w-12"
			/>
			<span className="sr-only">{message}</span>
		</div>
	);
}
