import {
	Bot,
	FileText,
	Globe,
	List,
	Pencil,
	Search,
	Sparkles,
	Terminal,
	Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ToolIconName } from "./conversation-tools";

export const CONVERSATION_TOOL_ICONS: Record<
	ToolIconName,
	ComponentType<{ className?: string }>
> = {
	bot: Bot,
	file: FileText,
	globe: Globe,
	list: List,
	pencil: Pencil,
	search: Search,
	sparkle: Sparkles,
	terminal: Terminal,
	wrench: Wrench,
};
