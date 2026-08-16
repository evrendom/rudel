import type { ComponentPropsWithoutRef } from "react";
import { getModelBrandIconClassName } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import type { ToolIconName } from "./conversation-tools";
import {
	TraceMarkdownIcon,
	TraceTypeScriptIcon,
} from "./conversation-trace-hugeicons";
import { getModelIconComponent } from "./conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";

const tagClassName =
	"inline-flex h-5 items-center gap-1 truncate rounded-[5px] bg-white pr-1.5 pl-0.5 dashboardy-mono text-[0.75rem]/4 font-medium text-[#000000df] shadow-[0_0_0_0.5px_transparent_inset,0_0_0_0.5px_#0000000f,0_1px_1px_-1px_#0000001a,0_1px_2px_0_#0000000d] select-none dark:bg-[#ffffff12] dark:text-[#ffffffed] dark:shadow-[0_0_0_0.5px_#ffffff12_inset,0_0_0_0.5px_transparent,0_1px_1px_-1px_transparent,0_1px_2px_0_transparent]";

const defaultIconClassName =
	"size-3.5 shrink-0 text-[#00000072] dark:text-[#ffffff64]";
const typeScriptIconClassName = "size-3.5 shrink-0 text-[#3178c6]";

function isTypeScriptFile(value: string) {
	return /\.(?:cts|mts|ts|tsx)$/i.test(value);
}

function isMarkdownFile(value: string) {
	return /\.(?:markdown|md)$/i.test(value);
}

interface ConversationTraceTagProps extends ComponentPropsWithoutRef<"span"> {
	hideIcon?: boolean;
	model?: string;
	toolIcon: ToolIconName;
	value: string;
}

export function ConversationTraceTag({
	children,
	className,
	hideIcon = false,
	model,
	toolIcon,
	value,
	...props
}: ConversationTraceTagProps) {
	const usesTypeScriptIcon =
		(toolIcon === "file" || toolIcon === "pencil") && isTypeScriptFile(value);
	const usesMarkdownIcon =
		(toolIcon === "file" || toolIcon === "pencil") && isMarkdownFile(value);
	const ModelIcon = getModelIconComponent(model);
	const ContextIcon =
		ModelIcon ??
		(usesTypeScriptIcon
			? TraceTypeScriptIcon
			: usesMarkdownIcon
				? TraceMarkdownIcon
				: CONVERSATION_TOOL_ICONS[toolIcon]);
	const context = ModelIcon
		? "delegated-model"
		: usesTypeScriptIcon
			? "typescript"
			: usesMarkdownIcon
				? "markdown"
				: toolIcon;
	const iconClassName = ModelIcon
		? cn("size-3.5 shrink-0", getModelBrandIconClassName(model))
		: usesTypeScriptIcon
			? typeScriptIconClassName
			: defaultIconClassName;

	return (
		<span
			{...props}
			className={cn(tagClassName, className)}
			data-trace-tag-context={context}
		>
			{hideIcon ? null : <ContextIcon className={iconClassName} />}
			{children}
		</span>
	);
}
