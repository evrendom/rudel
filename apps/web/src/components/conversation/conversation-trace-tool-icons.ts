import type { ComponentType } from "react";
import type { ToolIconName } from "./conversation-tools";
import {
	TraceBotIcon,
	TraceFileIcon,
	TraceGlobeIcon,
	TraceListIcon,
	TracePencilIcon,
	TraceSearchIcon,
	TraceSparklesIcon,
	TraceTerminalIcon,
	TraceWrenchIcon,
} from "./conversation-trace-hugeicons";

export const CONVERSATION_TOOL_ICONS: Record<
	ToolIconName,
	ComponentType<{ className?: string }>
> = {
	bot: TraceBotIcon,
	file: TraceFileIcon,
	globe: TraceGlobeIcon,
	list: TraceListIcon,
	pencil: TracePencilIcon,
	search: TraceSearchIcon,
	sparkle: TraceSparklesIcon,
	terminal: TraceTerminalIcon,
	wrench: TraceWrenchIcon,
};
