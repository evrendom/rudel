import { User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { DashboardModelIdentity } from "@/features/dashboard/components/DashboardModelBadges";
import { cn } from "@/lib/utils";

const sessionIdentityCounterClassName = "flex shrink-0 items-start gap-2";

function SessionUserIdentity({
	displayName,
	imageUrl,
	messageCount,
}: {
	displayName: string;
	imageUrl: string | undefined;
	messageCount: number | undefined;
}) {
	const safeMessageCount = messageCount ?? 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn(sessionIdentityCounterClassName, "cursor-help")}>
					{imageUrl ? (
						<img
							src={imageUrl}
							alt=""
							width={16}
							height={16}
							className="size-4 shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
						/>
					) : (
						<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--dashboardy-subsurface-strong)] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10">
							<User className="size-3 shrink-0" />
						</span>
					)}
					<div className="shrink-0 font-mono text-base font-semibold tracking-normal text-[color:var(--dashboardy-heading)] tabular-nums sm:text-[0.8125rem]">
						{safeMessageCount}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				{displayName}: {safeMessageCount} messages
			</TooltipContent>
		</Tooltip>
	);
}

export function SessionInteractionCounts({
	className,
	model,
	modelMessageCount,
	userDisplayName,
	userImageUrl,
	userMessageCount,
}: {
	className: string;
	model: string | undefined;
	modelMessageCount: number | undefined;
	userDisplayName: string;
	userImageUrl: string | undefined;
	userMessageCount: number | undefined;
}) {
	return (
		<div className={className}>
			{model ? (
				<DashboardModelIdentity
					className={sessionIdentityCounterClassName}
					model={model}
					messageCount={modelMessageCount}
				/>
			) : null}
			<SessionUserIdentity
				displayName={userDisplayName}
				imageUrl={userImageUrl}
				messageCount={userMessageCount}
			/>
		</div>
	);
}
