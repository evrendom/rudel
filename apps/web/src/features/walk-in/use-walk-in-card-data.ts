import * as React from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { buildWalkInCardModel } from "@/features/walk-in/lib/build-walk-in-card-model";
import { buildWalkInHandover } from "@/features/walk-in/lib/build-walk-in-handover";
import type { WalkInWrappedDataState } from "@/features/walk-in/lib/walk-in-handover-schema";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";

export function useWalkInCardData() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const wrappedV1Query = useAnalyticsQuery({
		...orpc.analytics.wrapped.v1.queryOptions({}),
		enabled: Boolean(session),
	});
	const wrappedData = wrappedV1Query.data ?? null;
	const wrappedDataState = getWrappedDataState({
		hasSession: Boolean(session),
		hasWrappedData: Boolean(wrappedData),
		isSessionPending,
		queryIsError: wrappedV1Query.isError,
		queryIsPending: wrappedV1Query.isPending,
	});
	const handover = buildWalkInHandover({
		state: wrappedDataState,
		wrappedData,
	});
	const name =
		session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
			? session.user.name
			: undefined;
	const email =
		session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
			? session.user.email
			: undefined;
	const accountLabel =
		name ?? email ?? handover.preview.profile.fallbackLabel;
	const cardModel = React.useMemo(
		() =>
			buildWalkInCardModel({
				accountLabel,
				wrappedData,
			}),
		[accountLabel, wrappedData],
	);

	return {
		accountLabel,
		cardModel,
		handover,
		session,
		wrappedData,
		wrappedDataState,
	};
}

function getWrappedDataState(params: {
	hasSession: boolean;
	hasWrappedData: boolean;
	isSessionPending: boolean;
	queryIsError: boolean;
	queryIsPending: boolean;
}): WalkInWrappedDataState {
	if (params.hasWrappedData) {
		return "live";
	}

	if (params.isSessionPending || (params.hasSession && params.queryIsPending)) {
		return "loading";
	}

	if (params.hasSession && params.queryIsError) {
		return "error";
	}

	return "seed";
}
