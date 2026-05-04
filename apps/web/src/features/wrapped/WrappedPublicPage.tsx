import type { PublicWrappedShare, WrappedShareRow } from "@rudel/api-routes";
import type { CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { getSessionUserId } from "@/features/auth/auth-route-utils";
import {
	getWrappedArchetypeStatLayerOverrides,
	WRAPPED_ARCHETYPE_CARD_THEMES,
	type WrappedArchetypeCardTheme,
} from "@/features/wrapped/team-card/archetypes";
import {
	DEFAULT_STAT_LAYER_OPACITIES,
	type WrappedTeamMemberCardEdition,
	type WrappedTeamMemberCardStatLayerOpacities,
} from "@/features/wrapped/team-card/card";
import { getWrappedShareSafeImageUrl } from "@/features/wrapped/team-card/share-media";
import {
	WrappedPublicCardAction,
	WrappedPublicCardScreen,
} from "@/features/wrapped/WrappedPublicCardScreen";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { useMountEffect } from "@/hooks/useMountEffect";
import { getDocumentReferrerDomain } from "@/lib/acquisition-attribution";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useWrappedPublicPage } from "./use-wrapped-public-page";
import "@/features/wrapped/wrapped.css";

interface WrappedPublicPageProps {
	publicId: string;
}

const PUBLIC_SHARE_CARD_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

// This page is the anonymous half of the growth loop:
// 1. open a real public wrapped page
// 2. see the safe card snapshot behind that page
// 3. click "Make yours"
// 4. continue into /wrapped for auth, setup, and replay
//
// We keep it separate from the authenticated wrapped page so public access never
// depends on the viewer's private analytics/session queries.
export function WrappedPublicPage(props: WrappedPublicPageProps) {
	const { publicId } = props;
	const location = useLocation();
	const { data: session } = authClient.useSession();
	const { trackWrappedShareCtaClicked, trackWrappedShareViewed } =
		useAnalyticsTracking({
			// The analytics contract still uses the older "wrapped_share" page name.
			pageName: "wrapped_share",
		});
	const publicPageQuery = useWrappedPublicPage(publicId);
	const sessionUserId = getSessionUserId(session);
	const makeYoursHref = appRoutes.wrappedTeamCardFromShare(
		publicId,
		location.search,
		getDocumentReferrerDomain(),
	);

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
	// the exposure event tied to a real, resolvable share instead of every
	// attempted route hit or loading state.
	useEffectOnceWhen({
		effect: () => {
			trackWrappedShareViewed({
				entrySource: "public_share",
				isAuthenticatedViewer: sessionUserId !== null,
				isNewUser: sessionUserId !== null ? false : undefined,
				shareId: publicId,
				sourceComponent: "wrapped_public_page",
				activationState: sessionUserId !== null ? "authenticated" : "anonymous",
			});
		},
		isReady: Boolean(publicPageQuery.data),
		key: publicId,
	});

	// Pending and error states stay explicit so the public route is readable and
	// so product can choose the fallback copy independently of the happy path.
	if (publicPageQuery.isPending) {
		return <PublicShareLoadingState />;
	}

	if (publicPageQuery.isError || !publicPageQuery.data) {
		return <PublicShareErrorState makeYoursHref={makeYoursHref} />;
	}

	return (
		<PublicShareReadyState
			makeYoursHref={makeYoursHref}
			onMakeYoursClick={() => {
				trackWrappedShareCtaClicked({
					entrySource: "public_share",
					isNewUser: sessionUserId !== null ? false : undefined,
					redirectTarget: makeYoursHref,
					shareId: publicId,
					sourceComponent: "wrapped_public_page",
					activationState:
						sessionUserId !== null ? "authenticated" : "guest_redirect",
				});
			}}
			share={publicPageQuery.data}
		/>
	);
}

// The ready state is intentionally presentational. All product logic stays in
// the route component above so the public page card can be iterated on without
// re-learning the auth and analytics flow.
function PublicShareReadyState(props: {
	makeYoursHref: string;
	onMakeYoursClick: () => void;
	share: PublicWrappedShare;
}) {
	const { makeYoursHref, onMakeYoursClick, share } = props;
	const activeArchetype = getPublicPageArchetype(share);
	const edition = getPublicPageEdition(share);
	const publicRow = buildPublicPageRow(share.snapshot.row);
	const statLayerOpacities = getPublicPageStatLayerOpacities(activeArchetype);

	return (
		<WrappedPublicCardScreen
			action={
				<WrappedPublicCardAction
					href={makeYoursHref}
					onClick={onMakeYoursClick}
				>
					Make yours
				</WrappedPublicCardAction>
			}
			activeArchetype={activeArchetype}
			backMetrics={share.snapshot.backMetrics ?? []}
			edition={edition}
			headerLeftMetric={share.snapshot.headerLeftMetric}
			headerRightMetric={share.snapshot.headerRightMetric}
			revealMetrics={share.snapshot.revealMetrics}
			row={publicRow}
			shellClassName={share.snapshot.shellClassName}
			shellStyle={PUBLIC_SHARE_CARD_SHELL_STYLE}
			statItems={share.snapshot.statItems}
			statLayerOpacities={statLayerOpacities}
			theme={share.snapshot.theme}
		/>
	);
}

function getPublicPageEdition(
	share: PublicWrappedShare,
): WrappedTeamMemberCardEdition | undefined {
	return share.variant === "decimal" ? "decimal" : undefined;
}

// The legacy Decimal archetype keeps its own stat tile treatment. Decimal
// edition shares now persist the user's classifier archetype and use only the
// edition prop for the stamp/back copy.
function getPublicPageStatLayerOpacities(
	archetype: WrappedArchetypeCardTheme,
): WrappedTeamMemberCardStatLayerOpacities | undefined {
	const overrides = getWrappedArchetypeStatLayerOverrides(archetype);

	if (!overrides) {
		return undefined;
	}

	return {
		...DEFAULT_STAT_LAYER_OPACITIES,
		...overrides,
	};
}

// Loading stays simple on purpose. The only job here is to hold the screen while
// the public snapshot is fetched, without introducing another route redirect.
function PublicShareLoadingState() {
	return (
		<section className="min-h-screen bg-[#f8f4ef] text-[#22201f]">
			<div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col items-center justify-center px-6 py-10 text-center">
				<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
					Rudel Wrapped
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
					Rudel Wrapped
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
function buildPublicPageRow(row: WrappedShareRow) {
	return {
		...row,
		email: null,
		imageUrl: getWrappedShareSafeImageUrl(row.imageUrl),
		userId: "public-wrapped-share",
	};
}

function getPublicPageArchetype(share: PublicWrappedShare) {
	const existingArchetype = WRAPPED_ARCHETYPE_CARD_THEMES.find(
		(candidate) => candidate.displayLabel === share.snapshot.archetypeLabel,
	);

	if (existingArchetype) {
		return existingArchetype;
	}

	return {
		classifierKey: undefined,
		displayLabel: share.snapshot.archetypeLabel,
		id: "public-share-snapshot",
		kind: "special_edition",
		shellClassName: share.snapshot.shellClassName,
		theme: share.snapshot.theme,
	} satisfies WrappedArchetypeCardTheme;
}
