export function MaintenancePage() {
	return (
		<main className="flex min-h-[100svh] items-center justify-center bg-background px-6 py-12 text-foreground">
			<section
				aria-labelledby="maintenance-message"
				className="mx-auto flex max-w-xl flex-col items-center text-center"
			>
				<h1
					id="maintenance-message"
					className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
				>
					We are experiencing technical difficulties. Sorry for that. We are
					working on it!
				</h1>
				<p className="mt-6 max-w-md text-balance text-base leading-7 text-muted-foreground">
					While we're out of service, we'd love to get some feedback about your
					experience so far:{" "}
					<a
						href="https://tally.so/r/ob0v6M"
						target="_blank"
						rel="noreferrer"
						className="font-medium text-foreground underline underline-offset-4"
					>
						https://tally.so/r/ob0v6M
					</a>
					.
				</p>
			</section>
		</main>
	);
}
