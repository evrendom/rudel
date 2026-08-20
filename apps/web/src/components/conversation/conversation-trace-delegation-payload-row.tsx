import type { TraceEvent } from "./conversation-trace";
import { conversationTraceLabelClassName } from "./conversation-trace-class-names";
import { ToolCallBody } from "./conversation-trace-event-row";
import { TraceExchangeIcon } from "./conversation-trace-hugeicons";
import { TraceIcon } from "./conversation-trace-icons";
import { ExpandableTraceRow } from "./expandable-trace-row";

export function ConversationTraceDelegationPayloadRow({
	event,
}: {
	event: Extract<TraceEvent, { kind: "tool" }>;
}) {
	return (
		<ExpandableTraceRow
			anchorId={`trace-event-${event.id}-payload`}
			compact
			fullPreviewText={undefined}
			label={<p className={conversationTraceLabelClassName}>Input / Output</p>}
			leading={<TraceIcon icon={TraceExchangeIcon} tone="cyan" />}
			treeBodyClassName="-ml-3"
			body={
				<ToolCallBody
					input={event.input}
					result={event.result}
					toolName={event.toolName}
				/>
			}
		/>
	);
}
