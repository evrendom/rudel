import type { PublicWrappedShare, WrappedShareRow } from "@rudel/api-routes";
import type { CSSProperties } from "react";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { getSessionUserId } from "@/features/auth/auth-route-utils";
import { WrappedTeamMemberCard } from "@/features/wrapped/team-card/card";
import { getWrappedShareSafeImageUrl } from "@/features/wrapped/team-card/share-media";
import { formatShareCardCreatedAt } from "@/features/wrapped/team-card/utils";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
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

// This page is the anonymous half of the growth loop:
// 1. open a real public share
// 2. see a safe replay of the card
// 3. click "Make yours"
// 4. continue into auth and /get-started
//
// We keep it separate from the authenticated wrapped page so public access never
// depends on the viewer's private analytics/session queries.
export function PublicWrappedSharePage(props: PublicWrappedSharePageProps) {
	const { shareId } = props;
	const { data: session } = authClient.useSession();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_share",
	});
	const wrappedShareQuery = usePublicWrappedShare(shareId);
	const sessionUserId = getSessionUserId(session);
	const makeYoursPath = appRoutes.getStartedFromWrappedShare(shareId);
	const makeYoursHref =
		sessionUserId !== null
			? makeYoursPath
			: `/?redirect=${encodeURIComponent(makeYoursPath)}`;

	// The wrapped surface uses a route-scoped body class for full-screen styling.
	// We keep that concern isolated to mount/unmount instead of threading layout
	// props through the whole public page tree.
	useMountEffect(() => {
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
	});

	// Count the share view once the public payload has actually loaded. That keeps
	// "shareViewed" tied to a real, resolvable share instead of every attempted
	// route hit or loading state.
	useEffectOnceWhen({
		effect: () => {
			trackUtilityUsed({
				entrySource: "public_share",
				isAuthenticatedViewer: sessionUserId !== null,
				shareId,
				sourceComponent: "wrapped_public_share_page",
				targetId: shareId,
				utilityName: "shareViewed",
				utilityState: sessionUserId !== null ? "authenticated" : "anonymous",
			});
		},
		isReady: Boolean(wrappedShareQuery.data),
		key: shareId,
	});

	// Pending and error states stay explicit so the public route is readable and
	// so product can choose the fallback copy independently of the happy path.
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
					entrySource: "public_share",
					redirectTarget: makeYoursPath,
					shareId,
					sourceComponent: "wrapped_public_share_page",
					targetId: shareId,
					utilityName: "makeYoursClicked",
					utilityState:
						sessionUserId !== null ? "authenticated" : "guest_redirect",
				});
			}}
			share={wrappedShareQuery.data}
		/>
	);
}

// The ready state is intentionally presentational. All product logic stays in
// the route component above so the public share card can be iterated on without
// re-learning the auth and analytics flow.
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
					{share.snapshot.archetypeLabel} is the theme they picked for this
					card. Make your own from your uploaded Geneva history.
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

// Loading stays simple on purpose. The only job here is to hold the screen while
// the public snapshot is fetched, without introducing another route redirect.
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

// Error state still offers the conversion CTA because a broken share link should
// not kill the acquisition path. Even when the shared card is gone, the viewer
// can still create their own wrapped card.
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

// WrappedTeamMemberCard expects the same row shape used in authenticated flows.
// For public replay we deliberately scrub identity fields that are irrelevant or
// private and only keep the card-safe snapshot values.
function buildPublicShareRow(row: WrappedShareRow) {
	return {
		...row,
		email: null,
		imageUrl: getWrappedShareSafeImageUrl(row.imageUrl),
		userId: "public-wrapped-share",
	};
}

// Shared cards store raw ISO timestamps. The public page formats them here so
// the persistence layer stays neutral and UI-friendly wording lives at the edge.
function formatShareDateLabel(createdAt: string) {
	const parsedDate = new Date(createdAt);

	if (Number.isNaN(parsedDate.getTime())) {
		return createdAt;
	}

	return formatShareCardCreatedAt(parsedDate);
}
