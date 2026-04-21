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
	const name = getSessionUserName(session);
	const email = getSessionUserEmail(session);
	const accountLabel = name ?? getEmailHandle(email) ?? "User";
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

function getEmailHandle(email: string | undefined) {
	if (!email) {
		return undefined;
	}

	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || undefined;
}

function getSessionUserName(
	session: ReturnType<typeof authClient.useSession>["data"],
) {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string" &&
		session.user.name.trim().length > 0
		? session.user.name.trim()
		: undefined;
}

function getSessionUserEmail(
	session: ReturnType<typeof authClient.useSession>["data"],
) {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string" &&
		session.user.email.trim().length > 0
		? session.user.email.trim()
		: undefined;
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
