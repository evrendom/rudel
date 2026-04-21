import type { PublicWrappedShare, WrappedShareRow } from "@rudel/api-routes";
import type { CSSProperties } from "react";
import { buttonVariants } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { getSessionUserId } from "@/features/auth/auth-route-utils";
import { WrappedTeamMemberCard } from "@/features/wrapped/team-card/card";
import { formatShareCardCreatedAt } from "@/features/wrapped/team-card/utils";
import { useMountEffect } from "@/hooks/useMountEffect";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { usePublicWrappedShare } from "./use-public-share";
import "@/features/wrapped/wrapped.css";

interface PublicWrappedSharePageProps {
	shareId: string;
}

const PUBLIC_SHARE_CARD_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

export function PublicWrappedSharePage(props: PublicWrappedSharePageProps) {
	const { shareId } = props;
	const { data: session } = authClient.useSession();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_share",
	});
	const wrappedShareQuery = usePublicWrappedShare(shareId);
	const sessionUserId = getSessionUserId(session);
	const makeYoursPath = buildWrappedShareMakeYoursPath(shareId);
	const makeYoursHref =
		sessionUserId !== null
			? makeYoursPath
			: `/?redirect=${encodeURIComponent(makeYoursPath)}`;

	useMountEffect(() => {
		trackUtilityUsed({
			sourceComponent: "wrapped_public_share_page",
			utilityName: "wrappedShareViewed",
			utilityState: shareId,
		});
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
	});

	if (wrappedShareQuery.isPending) {
		return <PublicShareLoadingState />;
	}

	if (wrappedShareQuery.isError || !wrappedShareQuery.data) {
		return <PublicShareErrorState makeYoursHref={makeYoursHref} />;
	}

	return (
		<PublicShareReadyState
			makeYoursHref={makeYoursHref}
			onMakeYoursClick={() => {
				trackUtilityUsed({
					sourceComponent: "wrapped_public_share_page",
					utilityName: "wrappedMakeYoursClicked",
					utilityState:
						sessionUserId !== null ? "authenticated" : "guest_redirect",
				});
			}}
			share={wrappedShareQuery.data}
		/>
	);
}

function PublicShareReadyState(props: {
	makeYoursHref: string;
	onMakeYoursClick: () => void;
	share: PublicWrappedShare;
}) {
	const { makeYoursHref, onMakeYoursClick, share } = props;
	const shareDateLabel = formatShareDateLabel(share.created_at);
	const publicRow = buildPublicShareRow(share.snapshot.row);

	return (
		<section className="min-h-screen bg-[#f8f4ef] text-[#22201f]">
			<div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col items-center justify-center px-6 py-10 text-center">
				<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
					Geneva Wrapped
				</p>
				<h1 className="mt-3 max-w-[12ch] text-balance font-[var(--app-font-heading)] text-[2.5rem] font-semibold tracking-[-0.07em] text-[#22201f]">
					{share.snapshot.row.displayName}&apos;s card
				</h1>
				<p className="mt-3 max-w-[28ch] text-pretty text-sm leading-6 text-[#6c6761]">
					{share.snapshot.archetypeLabel} is the card they picked. Make your own
					from your uploaded Geneva history.
				</p>

				<div className="team-lineup-surface-scope mt-8 w-full">
					<div className="grid justify-center">
						<WrappedTeamMemberCard
							headerLeftMetric={share.snapshot.headerLeftMetric}
							headerRightMetric={share.snapshot.headerRightMetric}
							layoutPreset="team-card-preview"
							mediaPanelClassName="mx-auto"
							row={publicRow}
							shellClassName={share.snapshot.shellClassName}
							shellStyle={PUBLIC_SHARE_CARD_SHELL_STYLE}
							statItems={share.snapshot.statItems}
							statTileClassName=""
							theme={share.snapshot.theme}
						/>
					</div>
				</div>

				<p className="mt-5 text-[0.75rem] font-medium tracking-[-0.02em] text-[#7b746d]">
					Shared {shareDateLabel}
				</p>

				<div className="mt-8 flex w-full flex-col gap-3">
					<a
						className={cn(
							buttonVariants({ size: "lg" }),
							"min-h-11 rounded-full bg-[#4f7cff] text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4]",
						)}
						href={makeYoursHref}
						onClick={onMakeYoursClick}
					>
						Make yours
					</a>
				</div>
			</div>
		</section>
	);
}

function PublicShareLoadingState() {
	return (
		<section className="min-h-screen bg-[#f8f4ef] text-[#22201f]">
			<div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col items-center justify-center px-6 py-10 text-center">
				<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
					Geneva Wrapped
				</p>
				<h1 className="mt-3 max-w-[13ch] text-balance font-[var(--app-font-heading)] text-[2.4rem] font-semibold tracking-[-0.07em] text-[#22201f]">
					Loading card…
				</h1>
				<p className="mt-3 max-w-[26ch] text-pretty text-sm leading-6 text-[#6c6761]">
					Pulling the shared snapshot and card state now.
				</p>
			</div>
		</section>
	);
}

function PublicShareErrorState(props: { makeYoursHref: string }) {
	const { makeYoursHref } = props;

	return (
		<section className="min-h-screen bg-[#f8f4ef] text-[#22201f]">
			<div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col items-center justify-center px-6 py-10 text-center">
				<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
					Geneva Wrapped
				</p>
				<h1 className="mt-3 max-w-[12ch] text-balance font-[var(--app-font-heading)] text-[2.4rem] font-semibold tracking-[-0.07em] text-[#22201f]">
					This card link expired or never existed.
				</h1>
				<p className="mt-3 max-w-[28ch] text-pretty text-sm leading-6 text-[#6c6761]">
					You can still create your own card from your uploaded history.
				</p>
				<div className="mt-8 w-full">
					<a
						className={cn(
							buttonVariants({ size: "lg" }),
							"min-h-11 w-full rounded-full bg-[#4f7cff] text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4]",
						)}
						href={makeYoursHref}
					>
						Make yours
					</a>
				</div>
			</div>
		</section>
	);
}

function buildPublicShareRow(row: WrappedShareRow) {
	return {
		...row,
		email: null,
		userId: "public-wrapped-share",
	};
}

function buildWrappedShareMakeYoursPath(shareId: string) {
	return `/get-started?share_id=${encodeURIComponent(shareId)}`;
}

function formatShareDateLabel(createdAt: string) {
	const parsedDate = new Date(createdAt);

	if (Number.isNaN(parsedDate.getTime())) {
		return createdAt;
	}

	return formatShareCardCreatedAt(parsedDate);
}
