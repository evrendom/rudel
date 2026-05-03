import type { DeveloperDetails, WrappedV1 } from "@rudel/api-routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";

interface BuildResolvedTeamCardRowParams {
	accountLabel: string;
	developerDetails: DeveloperDetails | undefined;
	guestPreviewDisplayName: string | undefined;
	guestPreviewImageUrl: string | null | undefined;
	profileImageFallbackSrc: string;
	sessionUserEmail: string | undefined;
	sessionUserId: string | undefined;
	sessionUserImage: string | undefined;
	sessionUserName: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
	wrappedMetrics: WrappedV1["metrics"] | undefined;
}

export function buildResolvedTeamCardRow(
	params: BuildResolvedTeamCardRowParams,
): TeamPageMemberRow {
	const {
		accountLabel,
		developerDetails,
		guestPreviewDisplayName,
		guestPreviewImageUrl,
		profileImageFallbackSrc,
		sessionUserEmail,
		sessionUserId,
		sessionUserImage,
		sessionUserName,
		teamMemberRows,
		wrappedMetrics,
	} = params;
	const profileImageSrc = resolveTeamCardProfileImageSrc({
		fallbackSrc: profileImageFallbackSrc,
		guestPreviewImageUrl,
		sessionUserImage,
	});
	const currentUserRow = findCurrentUserRow({
		sessionUserEmail,
		sessionUserId,
		teamMemberRows,
	});
	const { displayName } = resolveTeamCardDisplayName({
		accountLabel,
		currentUserRow,
		guestPreviewDisplayName,
		sessionUserEmail,
		sessionUserName,
	});
	const email = currentUserRow?.email ?? sessionUserEmail ?? null;

	if (developerDetails && sessionUserId) {
		const developerRow = {
			activeDays: developerDetails.active_days,
			cost: developerDetails.cost,
			displayName,
			email,
			favoriteModel: developerDetails.favorite_model,
			hasActivity:
				developerDetails.total_sessions > 0 ||
				developerDetails.active_days > 0 ||
				developerDetails.total_tokens > 0,
			imageUrl: profileImageSrc,
			inputTokens: developerDetails.input_tokens,
			lastActiveDate: developerDetails.last_active_date,
			outputTokens: developerDetails.output_tokens,
			role: currentUserRow?.role ?? "Tracked collaborator",
			totalSessions: developerDetails.total_sessions,
			totalTokens: developerDetails.total_tokens,
			userId: sessionUserId,
		};

		return {
			...developerRow,
			...getWrappedMetricFallbackFields(wrappedMetrics, developerRow),
		};
	}

	if (currentUserRow) {
		return {
			...currentUserRow,
			...getWrappedMetricFallbackFields(wrappedMetrics, currentUserRow),
			imageUrl: profileImageSrc,
		};
	}

	const wrappedFallbackFields = getWrappedMetricFallbackFields(wrappedMetrics);

	return {
		activeDays: wrappedFallbackFields.activeDays,
		cost: wrappedFallbackFields.cost,
		displayName,
		email,
		favoriteModel: wrappedFallbackFields.favoriteModel,
		hasActivity: wrappedFallbackFields.hasActivity,
		imageUrl: profileImageSrc,
		inputTokens: 0,
		lastActiveDate: wrappedMetrics?.last_session_at ?? null,
		outputTokens: 0,
		role: "Tracked collaborator",
		totalSessions: wrappedFallbackFields.totalSessions,
		totalTokens: wrappedFallbackFields.totalTokens,
		userId: sessionUserId ?? "wrapped-preview",
	};
}

export function resolveTeamCardProfileImageSrc(input: {
	fallbackSrc: string;
	guestPreviewImageUrl: string | null | undefined;
	sessionUserImage: string | undefined;
}) {
	const guestPreviewImageUrl = getMeaningfulImageSrc(
		input.guestPreviewImageUrl,
	);

	if (guestPreviewImageUrl) {
		return guestPreviewImageUrl;
	}

	const sessionUserImage = getMeaningfulImageSrc(input.sessionUserImage);

	if (sessionUserImage) {
		return sessionUserImage;
	}

	return input.fallbackSrc;
}

function getWrappedMetricFallbackFields(
	wrappedMetrics: WrappedV1["metrics"] | undefined,
	currentRow?: TeamPageMemberRow,
) {
	const totalSessions = Math.max(
		currentRow?.totalSessions ?? 0,
		wrappedMetrics?.total_sessions ?? 0,
	);
	const activeDays = Math.max(
		currentRow?.activeDays ?? 0,
		wrappedMetrics?.active_days ?? 0,
	);
	const totalTokens = Math.max(
		currentRow?.totalTokens ?? 0,
		wrappedMetrics?.total_tokens ?? 0,
	);
	const cost = Math.max(
		currentRow?.cost ?? 0,
		wrappedMetrics?.estimated_spend_usd ?? 0,
	);

	return {
		activeDays,
		cost,
		favoriteModel:
			wrappedMetrics?.favorite_model ?? currentRow?.favoriteModel ?? null,
		hasActivity:
			Boolean(currentRow?.hasActivity) ||
			totalSessions > 0 ||
			activeDays > 0 ||
			totalTokens > 0,
		totalSessions,
		totalTokens,
	};
}

function findCurrentUserRow(input: {
	sessionUserEmail: string | undefined;
	sessionUserId: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
}) {
	const { sessionUserEmail, sessionUserId, teamMemberRows } = input;
	const normalizedSessionEmail = normalizeEmail(sessionUserEmail);

	return teamMemberRows.find((row) => {
		if (sessionUserId && row.userId === sessionUserId) {
			return true;
		}

		return (
			Boolean(normalizedSessionEmail) &&
			normalizeEmail(row.email) === normalizedSessionEmail
		);
	});
}

function resolveTeamCardDisplayName(input: {
	accountLabel: string;
	currentUserRow: TeamPageMemberRow | undefined;
	guestPreviewDisplayName: string | undefined;
	sessionUserEmail: string | undefined;
	sessionUserName: string | undefined;
}) {
	const {
		accountLabel,
		currentUserRow,
		guestPreviewDisplayName,
		sessionUserEmail,
		sessionUserName,
	} = input;
	const meaningfulGuestPreviewDisplayName = getMeaningfulDisplayName(
		guestPreviewDisplayName,
	);
	const meaningfulSessionUserName = getMeaningfulDisplayName(sessionUserName);

	if (meaningfulGuestPreviewDisplayName) {
		return {
			displayName: meaningfulGuestPreviewDisplayName,
			source: "guestPreview.displayName",
		} as const;
	}

	if (meaningfulSessionUserName) {
		return {
			displayName: meaningfulSessionUserName,
			source: "session.name",
		} as const;
	}

	const emailHandle = getEmailHandle(sessionUserEmail);

	if (emailHandle) {
		return {
			displayName: emailHandle,
			source: "session.emailHandle",
		} as const;
	}

	const meaningfulCurrentUserDisplayName = getMeaningfulDisplayName(
		currentUserRow?.displayName,
	);

	if (meaningfulCurrentUserDisplayName) {
		return {
			displayName: meaningfulCurrentUserDisplayName,
			source: "teamRow.displayName",
		} as const;
	}

	return {
		displayName: getFallbackTeamMemberDisplayName(accountLabel),
		source: "accountLabelFallback",
	} as const;
}

function getFallbackTeamMemberDisplayName(accountLabel: string) {
	if (accountLabel.includes("@")) {
		return accountLabel.split("@")[0] || "User";
	}

	return accountLabel || "User";
}

function getEmailHandle(email: string | undefined) {
	if (!email) {
		return undefined;
	}

	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || undefined;
}

function normalizeEmail(email: string | null | undefined) {
	return email?.trim().toLowerCase() || undefined;
}

function getMeaningfulDisplayName(value: string | undefined) {
	const normalizedValue = value?.trim();

	if (!normalizedValue) {
		return undefined;
	}

	if (
		normalizedValue.toLowerCase() === "operator" ||
		normalizedValue.toLowerCase() === "unknown teammate"
	) {
		return undefined;
	}

	return normalizedValue;
}

function getMeaningfulImageSrc(value: string | null | undefined) {
	return value?.trim() || undefined;
}
