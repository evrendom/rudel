import { Bot, ChevronDown, User } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import {
	getModelBadgeTone,
	getModelBrandIconClassName,
} from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";

const iconShellClassName =
	"flex size-5 shrink-0 items-center justify-center rounded-[0.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-muted)]";

function getModelIconComponent(
	model: string | undefined,
): ComponentType<{ className?: string }> | null {
	if (!model) {
		return null;
	}

	const { icon } = getModelBadgeTone(model);
	if (icon === "claude") {
		return ClaudeModelIcon;
	}

	if (icon === "codex") {
		return CodexModelIcon;
	}

	return null;
}

export function TraceIcon({
	icon: Icon,
	className,
}: {
	icon: ComponentType<{ className?: string }>;
	className?: string;
}) {
	return (
		<span className={cn(iconShellClassName, className)}>
			<Icon className="size-3" />
		</span>
	);
}

function TraceDisclosureFrame({
	children,
	className,
	expanded,
	expandable,
}: {
	children: ReactNode;
	className?: string;
	expanded: boolean;
	expandable: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn("relative overflow-hidden", className)}
		>
			<span
				className={cn(
					"flex size-full items-center justify-center transition-opacity duration-100",
					expanded && "opacity-0",
					expandable &&
						!expanded &&
						"group-hover:opacity-0 group-focus-visible:opacity-0",
				)}
			>
				{children}
			</span>
			{expandable ? (
				<ChevronDown
					className={cn(
						"pointer-events-none absolute inset-0 m-auto size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-100",
						!expanded && "-rotate-90",
						expanded
							? "opacity-90"
							: "group-hover:opacity-90 group-focus-visible:opacity-90",
					)}
					strokeWidth={2.5}
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
}: {
	icon: ComponentType<{ className?: string }>;
	className?: string;
	expanded: boolean;
	expandable: boolean;
}) {
	return (
		<TraceDisclosureFrame
			className={cn(iconShellClassName, className)}
			expanded={expanded}
			expandable={expandable}
		>
			<Icon className="size-3" />
		</TraceDisclosureFrame>
	);
}

export function ModelTraceIcon({
	className,
	expanded,
	model,
}: {
	className?: string;
	expanded: boolean;
	model: string | undefined;
}) {
	const ModelIcon = getModelIconComponent(model);

	return (
		<TraceDisclosureIcon
			className={cn(
				ModelIcon && "border-black/10 bg-white",
				ModelIcon && getModelBrandIconClassName(model),
				className,
			)}
			expanded={expanded}
			expandable
			icon={ModelIcon ?? Bot}
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
				"flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[color:var(--dashboardy-muted)] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10",
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
				<User className="size-3" />
			)}
		</TraceDisclosureFrame>
	);
}
