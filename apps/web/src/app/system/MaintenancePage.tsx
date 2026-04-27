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
					We are experiencing techical difficulties. Sorry for that. We are
					working on it!
				</h1>
			</section>
		</main>
	);
}
