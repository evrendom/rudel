import {
	AiBrain01Icon,
	AlertCircleIcon,
	ArrowDown01Icon,
	ArrowRight01Icon,
	BotIcon,
	CodeIcon,
	ComputerTerminal01Icon,
	Exchange01Icon,
	File01Icon,
	FileTypeIcon,
	Globe02Icon,
	LeftToRightListBulletIcon,
	Message01Icon,
	PencilEdit01Icon,
	Search01Icon,
	Settings01Icon,
	SparklesIcon,
	TypescriptIcon,
	User02Icon,
	Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ComponentType } from "react";

type ConversationTraceGlyphProps = {
	className?: string;
	"data-trace-disclosure-symbol"?: string;
};

export type ConversationTraceGlyph = ComponentType<ConversationTraceGlyphProps>;

function createConversationTraceHugeicon(
	icon: IconSvgElement,
): ConversationTraceGlyph {
	return function ConversationTraceHugeicon({
		className,
		...traceAttributes
	}: ConversationTraceGlyphProps) {
		return (
			<HugeiconsIcon
				{...traceAttributes}
				aria-hidden="true"
				className={className}
				color="currentColor"
				data-trace-hugeicon
				icon={icon}
				strokeWidth={1.5}
			/>
		);
	};
}

export const TraceAlertIcon = createConversationTraceHugeicon(AlertCircleIcon);
export const TraceBotIcon = createConversationTraceHugeicon(BotIcon);
export const TraceBrainIcon = createConversationTraceHugeicon(AiBrain01Icon);
export const TraceChevronDownIcon =
	createConversationTraceHugeicon(ArrowDown01Icon);
export const TraceChevronRightIcon =
	createConversationTraceHugeicon(ArrowRight01Icon);
export const TraceCodeIcon = createConversationTraceHugeicon(CodeIcon);
export const TraceExchangeIcon =
	createConversationTraceHugeicon(Exchange01Icon);
export const TraceFileIcon = createConversationTraceHugeicon(File01Icon);
export const TraceMarkdownIcon = createConversationTraceHugeicon(FileTypeIcon);
export const TraceGlobeIcon = createConversationTraceHugeicon(Globe02Icon);
export const TraceListIcon = createConversationTraceHugeicon(
	LeftToRightListBulletIcon,
);
export const TraceMessageIcon = createConversationTraceHugeicon(Message01Icon);
export const TracePencilIcon =
	createConversationTraceHugeicon(PencilEdit01Icon);
export const TraceSearchIcon = createConversationTraceHugeicon(Search01Icon);
export const TraceSettingsIcon =
	createConversationTraceHugeicon(Settings01Icon);
export const TraceSparklesIcon = createConversationTraceHugeicon(SparklesIcon);
export const TraceTerminalIcon = createConversationTraceHugeicon(
	ComputerTerminal01Icon,
);
export const TraceTypeScriptIcon =
	createConversationTraceHugeicon(TypescriptIcon);
export const TraceUserIcon = createConversationTraceHugeicon(User02Icon);
export const TraceWrenchIcon = createConversationTraceHugeicon(Wrench01Icon);
