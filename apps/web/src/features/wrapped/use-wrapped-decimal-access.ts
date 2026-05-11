import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	// biome-ignore lint/style/noRestrictedImports: variant gate must re-evaluate on every navigation that re-adds ?variant=decimal, so a one-shot mount effect cannot replace this.
	useEffect,
} from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffectOnceWhen } from "@/app/hooks/useEffectOnceWhen";
import {
	getWrappedDecimalClaimTokenFromSearch,
	getWrappedVariantFromSearch,
	WRAPPED_DECIMAL_CLAIM_QUERY_PARAM,
	WRAPPED_VARIANT_DECIMAL,
	WRAPPED_VARIANT_NORMAL,
	WRAPPED_VARIANT_QUERY_PARAM,
	type WrappedVariant,
} from "@/app/routes";
import { client, orpc } from "@/lib/orpc";

interface UseWrappedDecimalAccessInput {
	// We pass the user id (not the whole session) so the entitlement query is
	// disabled cleanly when the route is mounted for an unauthenticated visitor.
	userId: string | null;
}

interface UseWrappedDecimalAccessResult {
	// The resolved variant after URL parsing, claim redemption, and entitlement
	// gating. Components downstream should always read from this — never trust
	// the raw `?variant=` query param, since a non-entitled user would otherwise
	// see Decimal chrome before the gate kicks in.
	variant: WrappedVariant;
	// True once we know whether the current user holds Decimal entitlement.
	// Components can use this to gate the variant switcher UI.
	isDecimalEntitled: boolean;
	// True while we are still resolving the user's entitlement. Consumers should
	// avoid showing the entitled-only switcher during this window.
	isEntitlementLoading: boolean;
}

// Single hook that owns the claim-token + variant-gate lifecycle on /wrapped.
//
// Responsibilities (in order):
//   1. If the URL has `?claim=<token>` and the user is signed in, call
//      `wrappedDecimalClaim.redeem` once. On granted/already_entitled rewrite
//      the URL to `?variant=decimal`. On invalid_or_used drop `?claim` and toast.
//   2. Read the user's current entitlement via `wrappedDecimalClaim.getMine`.
//   3. If the URL says `?variant=decimal` but the user is not entitled, drop
//      the param so the page falls back to the normal card. This is the
//      front-end mirror of the server gate inside `wrappedShare.create` —
//      necessary for UX, not for security.
export function useWrappedDecimalAccess(
	input: UseWrappedDecimalAccessInput,
): UseWrappedDecimalAccessResult {
	const { userId } = input;
	const [searchParams, setSearchParams] = useSearchParams();
	const claimToken = getWrappedDecimalClaimTokenFromSearch(searchParams);
	const requestedVariant = getWrappedVariantFromSearch(searchParams);
	const queryClient = useQueryClient();
	const getMineQueryOptions = orpc.wrappedDecimalClaim.getMine.queryOptions();

	const entitlementQuery = useQuery({
		...getMineQueryOptions,
		enabled: userId !== null,
		staleTime: 60_000,
	});
	const isDecimalEntitled = entitlementQuery.data?.entitled ?? false;
	const isEntitlementLoading =
		entitlementQuery.isLoading || entitlementQuery.isFetching;

	// One redeem attempt per token/user combo. The key combines token + user so a
	// signed-out visitor who later signs in for the same claim token redeems
	// exactly once. Different tokens fire independently, but the per-user partial
	// unique index on the server still keeps the same caller from claiming two.
	useEffectOnceWhen({
		effect: () => {
			if (claimToken === null || userId === null) {
				return;
			}

			void redeemClaim({
				claimToken,
				markEntitled: () => {
					// Optimistically reflect entitlement in the query cache so the
					// variant gate below does not bounce the user away from
					// ?variant=decimal in the brief window before the refetch lands.
					queryClient.setQueryData(getMineQueryOptions.queryKey, {
						entitled: true,
					});
				},
				refetchEntitlement: () => entitlementQuery.refetch(),
				setSearchParams,
			});
		},
		isReady: claimToken !== null && userId !== null,
		key:
			claimToken === null || userId === null ? null : `${userId}:${claimToken}`,
	});

	useEffect(() => {
		if (requestedVariant !== WRAPPED_VARIANT_DECIMAL) {
			return;
		}

		// Wait for the entitlement query to resolve before deciding whether to
		// drop the param. Otherwise we'd flicker an entitled user back to the
		// normal card on every cold load.
		if (userId === null || isEntitlementLoading) {
			return;
		}

		if (isDecimalEntitled) {
			return;
		}

		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);
				nextSearchParams.delete(WRAPPED_VARIANT_QUERY_PARAM);
				return nextSearchParams;
			},
			{ replace: true },
		);
	}, [
		isDecimalEntitled,
		isEntitlementLoading,
		requestedVariant,
		setSearchParams,
		userId,
	]);

	const resolvedVariant: WrappedVariant =
		requestedVariant === WRAPPED_VARIANT_DECIMAL && isDecimalEntitled
			? WRAPPED_VARIANT_DECIMAL
			: WRAPPED_VARIANT_NORMAL;

	return {
		variant: resolvedVariant,
		isDecimalEntitled,
		isEntitlementLoading,
	};
}

async function redeemClaim(input: {
	claimToken: string;
	markEntitled: () => void;
	refetchEntitlement: () => Promise<unknown>;
	setSearchParams: ReturnType<typeof useSearchParams>[1];
}): Promise<void> {
	const { claimToken, markEntitled, refetchEntitlement, setSearchParams } =
		input;

	const result = await client.wrappedDecimalClaim
		.redeem({ token: claimToken })
		.catch(() => ({ status: "invalid_or_used" as const }));

	if (result.status === "granted" || result.status === "already_entitled") {
		// Mark entitled before the URL flip so the variant gate effect, which
		// runs synchronously on the next render, does not strip variant=decimal
		// before the refetch has had a chance to confirm entitlement.
		markEntitled();
	}

	setSearchParams(
		(previousSearchParams) => {
			const nextSearchParams = new URLSearchParams(previousSearchParams);
			nextSearchParams.delete(WRAPPED_DECIMAL_CLAIM_QUERY_PARAM);

			if (result.status === "granted" || result.status === "already_entitled") {
				nextSearchParams.set(
					WRAPPED_VARIANT_QUERY_PARAM,
					WRAPPED_VARIANT_DECIMAL,
				);
			} else {
				nextSearchParams.delete(WRAPPED_VARIANT_QUERY_PARAM);
			}

			return nextSearchParams;
		},
		{ replace: true },
	);

	if (result.status === "granted") {
		void refetchEntitlement();
		toast.success("Decimal Wrapped unlocked.");
	} else if (result.status === "already_entitled") {
		void refetchEntitlement();
	} else {
		toast.error("This Decimal claim link is no longer valid.");
	}
}
