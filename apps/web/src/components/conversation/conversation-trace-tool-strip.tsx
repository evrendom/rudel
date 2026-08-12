import { getToolPresentation, type ToolIconName } from "./conversation-tools";
import type { TraceEvent } from "./conversation-trace";
import { TraceIcon } from "./conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";

/** Collapsed agent turns advertise which tools ran so the trace stays scannable. */
export function AgentToolStrip({ events }: { events: TraceEvent[] }) {
	// Keyed by event id, since the same tool usually runs several times a turn.
	const tools: { id: string; icon: ToolIconName }[] = [];

	for (const event of events) {
		if (event.kind === "tool") {
			tools.push({
				id: event.id,
				icon: getToolPresentation(event.toolName).icon,
			});
		}
	}

	if (tools.length === 0) {
		return null;
	}

	return (
		<span className="flex min-w-0 items-center gap-1">
			{tools.slice(0, 8).map((tool) => (
				<TraceIcon key={tool.id} icon={CONVERSATION_TOOL_ICONS[tool.icon]} />
			))}
			{tools.length > 8 ? (
				<span className="text-[0.75rem] text-[color:var(--dashboardy-muted)]">
					+{tools.length - 8}
				</span>
			) : null}
		</span>
	);
}
