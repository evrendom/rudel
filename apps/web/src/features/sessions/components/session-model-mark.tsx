import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import { getModelBadgeTone } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";

export function SessionModelMark({
	avatarUrl,
	model,
	userLabel,
}: {
	avatarUrl: string | undefined;
	model: string;
	userLabel: string;
}) {
	const tone = getModelBadgeTone(model);
	const userTitle = `Session owner: ${userLabel}`;

	return (
		<div
			className={cn(
				"relative flex size-7 shrink-0 items-center justify-center",
				tone.icon === "claude" && "text-[#b96949]",
				tone.icon === "codex" && "text-[#111] dark:text-white",
				tone.icon === null && "text-(--session-overview-muted)",
			)}
		>
			<span
				className={cn(
					"absolute inset-0 [-webkit-mask:url('/opaline-trace-fill.svg')_center/contain_no-repeat] [mask:url('/opaline-trace-fill.svg')_center/contain_no-repeat]",
					tone.icon === "claude" && "bg-[#cc7d5e]/10",
					tone.icon !== "claude" && "bg-black/4 dark:bg-white/8",
				)}
			/>
			{tone.icon === "claude" ? (
				<ClaudeModelIcon className="size-3.5 shrink-0" />
			) : tone.icon === "codex" ? (
				<CodexModelIcon className="size-3.5 shrink-0" />
			) : (
				<span className="size-1.5 rounded-full bg-current" />
			)}
			<Avatar
				aria-label={userTitle}
				className="absolute -right-0.5 -bottom-0.5 size-3.5 bg-(--session-overview-surface) ring-1 ring-(--session-overview-surface) after:border-black/5 dark:after:border-white/10"
				role="img"
				title={userTitle}
			>
				{avatarUrl ? (
					<AvatarImage alt="" decoding="async" loading="lazy" src={avatarUrl} />
				) : null}
				<AvatarFallback className="bg-(--session-overview-surface)">
					<User
						aria-hidden="true"
						className="size-2.5 shrink-0 stroke-(--session-overview-muted)"
					/>
				</AvatarFallback>
			</Avatar>
		</div>
	);
}
