import { cn } from "@/lib/utils";
import {
	getSessionTurnLensMatches,
	SESSION_TURN_LENSES,
	type SessionTurnLensId,
	type SessionTurnLensInput,
} from "./session-turn-lenses";

export function SessionTurnLensChips({
	activeLensId,
	onToggle,
	options,
}: {
	activeLensId: SessionTurnLensId | undefined;
	onToggle: (lensId: SessionTurnLensId) => void;
	options: readonly SessionTurnLensInput[];
}) {
	return (
		<fieldset className="flex min-h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-(--session-overview-border) px-3">
			<legend className="sr-only">Turn lenses</legend>
			{SESSION_TURN_LENSES.map((lens) => {
				const selected = lens.id === activeLensId;
				const count = getSessionTurnLensMatches(options, lens.id).size;
				return (
					<button
						key={lens.id}
						type="button"
						aria-keyshortcuts="n p"
						aria-pressed={selected}
						className={cn(
							"relative flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium outline-none ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-[color-mix(in_srgb,var(--session-overview-accent)_12%,var(--session-overview-surface))] text-(--session-overview-accent) ring-[color-mix(in_srgb,var(--session-overview-accent)_35%,transparent)]"
								: "bg-(--session-overview-surface) text-(--session-overview-muted) ring-(--session-overview-border) hover:bg-(--session-overview-hover) hover:text-(--session-overview-text)",
						)}
						onClick={() => onToggle(lens.id)}
					>
						{lens.label}
						<span className="tabular-nums opacity-70">{count}</span>
					</button>
				);
			})}
		</fieldset>
	);
}
