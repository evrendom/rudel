export function DesktopOnlyOverlay() {
	return (
		<div
			data-testid="desktop-only-overlay"
			className="fixed inset-0 z-[120] hidden items-center justify-center bg-background/96 px-6 text-center backdrop-blur-sm max-[499px]:flex"
		>
			<p className="max-w-md text-sm leading-6 text-muted-foreground">
				Please use it on desktop or resize your window. Otherwise it will look
				horrendous.
			</p>
		</div>
	);
}
