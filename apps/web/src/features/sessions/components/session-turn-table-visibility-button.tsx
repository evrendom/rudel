import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SessionTurnTableVisibilityButton({
	controlsId,
	expanded,
	onClick,
}: {
	controlsId: string;
	expanded: boolean;
	onClick: () => void;
}) {
	const label = expanded ? "Hide turn table" : "Show turn table";

	return (
		<button
			type="button"
			aria-controls={controlsId}
			aria-expanded={expanded}
			aria-label={label}
			className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
			title={label}
			onClick={onClick}
		>
			{expanded ? (
				<PanelLeftClose aria-hidden="true" className="size-4 shrink-0" />
			) : (
				<PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" />
			)}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}
