import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { authClient } from "@/lib/auth-client";
import { formatDateRangeLabel, formatIsoDate } from "@/lib/format";
import { orpc } from "@/lib/orpc";

const WRAPPED_FAMILY_DAYS = 365;

export type WrappedFamilySpendStory = {
	activeDays: number;
	displayName: string;
	favoriteModel: string | null;
	firstName: string;
	initials: string;
	normalizedSpend: number;
	periodEnd: string;
	periodLabel: string;
	periodStart: string;
	sessionCount: number;
	spendDescriptor: string;
	spendPalette: "cool" | "sunrise" | "warm";
	totalCost: number;
	totalTokens: number;
};

type WrappedFamilySpendState = {
	error: unknown;
	isError: boolean;
	isLoading: boolean;
	story: WrappedFamilySpendStory | null;
};

function getWrappedFamilyRange(days: number) {
	const endDate = new Date();
	const startDate = new Date(endDate);
	startDate.setDate(endDate.getDate() - (days - 1));

	return {
		days,
		endDate: formatIsoDate(endDate),
		startDate: formatIsoDate(startDate),
	};
}

function getInitials(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function getFirstName(name: string) {
	const firstPart = name.split(/\s+/).find(Boolean);
	return firstPart ?? "Operator";
}

function getNormalizedSpend(totalCost: number) {
	const clampedCost = Math.max(0, totalCost);
	const referenceMax = 160;
	const normalizedValue =
		Math.log(clampedCost + 1) / Math.log(referenceMax + 1);

	return Math.min(1, Math.max(0, normalizedValue));
}

function getSpendDescriptor(totalCost: number) {
	if (totalCost >= 120) {
		return "Full send";
	}

	if (totalCost >= 40) {
		return "Running hot";
	}

	if (totalCost >= 10) {
		return "Steady burn";
	}

	return "Soft launch";
}

function getSpendPalette(normalizedSpend: number) {
	if (normalizedSpend >= 0.72) {
		return "warm" as const;
	}

	if (normalizedSpend >= 0.36) {
		return "sunrise" as const;
	}

	return "cool" as const;
}

export function useWrappedFamilySpendData(): WrappedFamilySpendState {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const wrappedRange = useMemo(
		() => getWrappedFamilyRange(WRAPPED_FAMILY_DAYS),
		[],
	);
	const currentUserId = session?.user.id ?? null;

	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});

	return useMemo(() => {
		if (isSessionPending || developerDetailsQuery.isPending) {
			return {
				error: null,
				isError: false,
				isLoading: true,
				story: null,
			} satisfies WrappedFamilySpendState;
		}

		if (!currentUserId) {
			return {
				error: new Error("Missing authenticated session for wrapped route."),
				isError: true,
				isLoading: false,
				story: null,
			} satisfies WrappedFamilySpendState;
		}

		if (developerDetailsQuery.isError) {
			return {
				error: developerDetailsQuery.error,
				isError: true,
				isLoading: false,
				story: null,
			} satisfies WrappedFamilySpendState;
		}

		if (!developerDetailsQuery.data) {
			return {
				error: new Error(
					"Developer analytics are unavailable for wrapped route.",
				),
				isError: true,
				isLoading: false,
				story: null,
			} satisfies WrappedFamilySpendState;
		}

		const displayName = session?.user.name?.trim() || "Operator";
		const normalizedSpend = getNormalizedSpend(developerDetailsQuery.data.cost);

		return {
			error: null,
			isError: false,
			isLoading: false,
			story: {
				activeDays: developerDetailsQuery.data.active_days,
				displayName,
				favoriteModel: developerDetailsQuery.data.favorite_model,
				firstName: getFirstName(displayName),
				initials: getInitials(displayName),
				normalizedSpend,
				periodEnd: wrappedRange.endDate,
				periodLabel: formatDateRangeLabel(
					wrappedRange.startDate,
					wrappedRange.endDate,
				),
				periodStart: wrappedRange.startDate,
				sessionCount: developerDetailsQuery.data.total_sessions,
				spendDescriptor: getSpendDescriptor(developerDetailsQuery.data.cost),
				spendPalette: getSpendPalette(normalizedSpend),
				totalCost: developerDetailsQuery.data.cost,
				totalTokens: developerDetailsQuery.data.total_tokens,
			},
		} satisfies WrappedFamilySpendState;
	}, [
		currentUserId,
		developerDetailsQuery.data,
		developerDetailsQuery.error,
		developerDetailsQuery.isError,
		developerDetailsQuery.isPending,
		isSessionPending,
		session?.user.name,
		wrappedRange.endDate,
		wrappedRange.startDate,
	]);
}
