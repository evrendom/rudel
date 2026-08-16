import type { ComponentType, ReactNode } from "react";
import {
	getModelBadgeTone,
	getModelBrandIconClassName,
} from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import type { ToolIconName } from "./conversation-tools";
import {
	TraceBotIcon,
	TraceChevronDownIcon,
	TraceUserIcon,
} from "./conversation-trace-hugeicons";
import { getModelIconComponent } from "./conversation-trace-model-icon";

const iconShellClassName =
	"flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[color:var(--dashboardy-border)] text-[color:var(--dashboardy-muted)]";

export type TraceIconTone =
	| "amber"
	| "blue"
	| "claude"
	| "cyan"
	| "grass"
	| "neutral"
	| "openai"
	| "tomato"
	| "violet";

export function TraceIcon({
	icon: Icon,
	className,
	toolIcon,
	tone = "neutral",
}: {
	icon: ComponentType<{ className?: string }>;
	className?: string;
	toolIcon?: ToolIconName;
	tone?: TraceIconTone;
}) {
	return (
		<span
			className={cn(iconShellClassName, className)}
			data-trace-icon
			data-trace-icon-tone={tone}
			data-trace-tool-icon={toolIcon}
		>
			<Icon className="size-3.5" />
		</span>
	);
}

function TraceDisclosureFrame({
	children,
	className,
	expanded,
	expandable,
	toolIcon,
	tone,
}: {
	children: ReactNode;
	className?: string;
	expanded: boolean;
	expandable: boolean;
	toolIcon?: ToolIconName;
	tone?: TraceIconTone;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn("relative overflow-hidden", className)}
			data-trace-icon={tone ? "" : undefined}
			data-trace-icon-tone={tone}
			data-trace-tool-icon={toolIcon}
		>
			<span
				className={cn(
					"flex size-full items-center justify-center",
					expandable && "group-hover:opacity-0 group-focus-visible:opacity-0",
				)}
				data-trace-disclosure-symbol="icon"
			>
				{children}
			</span>
			{expandable ? (
				<TraceChevronDownIcon
					className={cn(
						"pointer-events-none absolute inset-0 m-auto size-3 shrink-0 opacity-0 group-hover:opacity-90 group-focus-visible:opacity-90",
						!expanded && "-rotate-90",
					)}
					data-trace-disclosure-symbol="chevron"
				/>
			) : null}
		</span>
	);
}

export function TraceDisclosureIcon({
	icon: Icon,
	className,
	expanded,
	expandable,
	toolIcon,
	tone = "neutral",
}: {
	icon: ComponentType<{ className?: string }>;
	className?: string;
	expanded: boolean;
	expandable: boolean;
	toolIcon?: ToolIconName;
	tone?: TraceIconTone;
}) {
	return (
		<TraceDisclosureFrame
			className={cn(iconShellClassName, className)}
			expanded={expanded}
			expandable={expandable}
			toolIcon={toolIcon}
			tone={tone}
		>
			<Icon className="size-3.5" />
		</TraceDisclosureFrame>
	);
}

export function ModelTraceIcon({
	className,
	expanded,
	expandable = true,
	model,
}: {
	className?: string;
	expanded: boolean;
	expandable?: boolean;
	model: string | undefined;
}) {
	const ModelIcon = getModelIconComponent(model);
	const modelBrand = model ? getModelBadgeTone(model).icon : null;
	const modelTone: TraceIconTone =
		modelBrand === "claude"
			? "claude"
			: modelBrand === "codex"
				? "openai"
				: "violet";

	return (
		<TraceDisclosureIcon
			className={cn(
				ModelIcon && "border-black/10",
				ModelIcon && getModelBrandIconClassName(model),
				className,
			)}
			expanded={expanded}
			expandable={expandable}
			icon={ModelIcon ?? TraceBotIcon}
			tone={modelTone}
		/>
	);
}

export function UserTraceAvatar({
	className,
	expanded,
	expandable,
	imageUrl,
}: {
	className?: string;
	expanded: boolean;
	expandable: boolean;
	imageUrl: string | undefined;
}) {
	return (
		<TraceDisclosureFrame
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded-full text-[color:var(--dashboardy-muted)] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10",
				className,
			)}
			expanded={expanded}
			expandable={expandable}
		>
			{imageUrl ? (
				<img
					src={imageUrl}
					alt=""
					width={20}
					height={20}
					className="size-full rounded-full object-cover"
				/>
			) : (
				<TraceUserIcon className="size-3" />
			)}
		</TraceDisclosureFrame>
	);
}
