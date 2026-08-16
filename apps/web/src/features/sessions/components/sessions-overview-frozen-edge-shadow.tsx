export function SessionsOverviewFrozenEdgeShadow({
	isVisible,
}: {
	isVisible: boolean;
}) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 left-[368px] z-50 w-0"
		>
			<div
				className="absolute -top-px bottom-0 left-full -ml-px w-px opacity-0 transition-opacity duration-200 [background:none] [box-shadow:6px_0px_16px_4px_rgba(0,0,0,0.12)] [clip-path:inset(0_-38px_0_0)] [transition-timing-function:ease] data-[visible=true]:opacity-100"
				data-slot="sessions-overview-frozen-edge-shadow"
				data-visible={isVisible ? "true" : "false"}
			/>
		</div>
	);
}
