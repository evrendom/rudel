import type {
	WrappedShareRecord,
	WrappedShareSnapshot,
	WrappedShareVariant,
} from "@rudel/api-routes";
import { useCallback, useRef, useState } from "react";
import { appRoutes } from "@/app/routes";
import { client } from "@/lib/orpc";

const SHARE_URL_LABEL_MAX_LENGTH = 30;
const SHARE_URL_LABEL_PUBLIC_PATH_MARKER = "/wrapped/";

interface UseWrappedTeamCardShareOptions {
	// Product analytics wants to know when a share record is first materialized.
	// We keep that callback optional so the hook stays reusable and does not own
	// analytics directly.
	onShareCreated?: (shareRecord: WrappedShareRecord) => void;
	resolveSocialImageDataUrl?: () => Promise<string | undefined>;
	// Selects which public card variant the server should persist. Decimal
	// shares are gated server-side on entitlement; the frontend default keeps
	// normal share behavior unchanged for everyone else.
	variant?: WrappedShareVariant;
}

// This hook owns the "create a real share only when needed" behavior for the
// wrapped team card. The Saturday launch needs a public URL, but we only want
// to create it when the user actually enters the share flow.
export function useWrappedTeamCardShare(
	snapshot: WrappedShareSnapshot,
	options?: UseWrappedTeamCardShareOptions,
) {
	const variant: WrappedShareVariant = options?.variant ?? "normal";
	// Multiple buttons can ask for a share at roughly the same time. We keep the
	// in-flight promise in a ref so copy/share/download all collapse onto one
	// request for the user's stable public link instead of creating duplicates.
	const shareRequestRef = useRef<Promise<WrappedShareRecord> | null>(null);
	const [shareRecord, setShareRecord] = useState<WrappedShareRecord | null>(
		null,
	);
	const [isCreatingShare, setIsCreatingShare] = useState(false);
	const [hasShareError, setHasShareError] = useState(false);
	const { onShareCreated, resolveSocialImageDataUrl } = options ?? {};
	const shareUrl = shareRecord
		? buildWrappedShareUrl(shareRecord.id)
		: undefined;

	// ensureShare is the single entry point for "make sure this card has a real
	// public URL". It first reuses cached data, then reuses any in-flight request,
	// and only finally creates a new share if nothing exists yet.
	const ensureShare = useCallback(async () => {
		if (shareRecord) {
			return shareRecord;
		}

		if (shareRequestRef.current) {
			return shareRequestRef.current;
		}

		setIsCreatingShare(true);
		setHasShareError(false);

		const shareRequest = resolveWrappedShareSnapshotWithSocialImage({
			resolveSocialImageDataUrl,
			snapshot,
		})
			.then((snapshotWithSocialImage) =>
				client.wrappedShare.create({
					snapshot: snapshotWithSocialImage,
					variant,
				}),
			)
			.then((createdShare) => {
				setShareRecord(createdShare);
				onShareCreated?.(createdShare);
				return createdShare;
			})
			.catch((error: unknown) => {
				setHasShareError(true);
				throw error;
			})
			.finally(() => {
				shareRequestRef.current = null;
				setIsCreatingShare(false);
			});

		shareRequestRef.current = shareRequest;
		return shareRequest;
	}, [
		onShareCreated,
		resolveSocialImageDataUrl,
		shareRecord,
		snapshot,
		variant,
	]);

	return {
		ensureShare,
		hasShareError,
		isCreatingShare,
		shareUrl,
		shareUrlLabel: formatShareUrlLabel(
			shareUrl,
			isCreatingShare,
			hasShareError,
		),
	};
}

async function resolveWrappedShareSnapshotWithSocialImage(input: {
	resolveSocialImageDataUrl: (() => Promise<string | undefined>) | undefined;
	snapshot: WrappedShareSnapshot;
}) {
	const { resolveSocialImageDataUrl, snapshot } = input;

	if (!resolveSocialImageDataUrl) {
		return snapshot;
	}

	const socialImageDataUrl = await resolveSocialImageDataUrl().catch(
		() => undefined,
	);

	if (!socialImageDataUrl) {
		return snapshot;
	}

	return {
		...snapshot,
		socialImageDataUrl,
	};
}

// The share URL is browser-derived because the server only needs to persist the
// share id. That keeps the backend environment-agnostic and lets the client use
// the current deployment origin automatically.
function buildWrappedShareUrl(shareId: string) {
	if (typeof window === "undefined") {
		return undefined;
	}

	return new URL(
		appRoutes.wrappedPublic(shareId),
		window.location.origin,
	).toString();
}

// Before the share exists we still show a stable label in the UI. That gives the
// designer a predictable placeholder while the real share record is being made.
function formatShareUrlLabel(
	shareUrl: string | undefined,
	isCreatingShare: boolean,
	hasShareError: boolean,
) {
	if (isCreatingShare) {
		return "Creating link...";
	}

	if (hasShareError) {
		return appRoutes.wrappedTeamCard();
	}

	if (!shareUrl) {
		return appRoutes.wrappedTeamCard();
	}

	return leftTruncateShareUrlLabel(
		shareUrl.replace(/^https?:\/\//u, ""),
		SHARE_URL_LABEL_MAX_LENGTH,
	);
}

function leftTruncateShareUrlLabel(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	const publicPathIndex = value.indexOf(SHARE_URL_LABEL_PUBLIC_PATH_MARKER);
	if (publicPathIndex > 0) {
		const publicPathLabel = `...${value.slice(publicPathIndex)}`;

		if (publicPathLabel.length <= maxLength) {
			return publicPathLabel;
		}
	}

	return `...${value.slice(-(maxLength - 3))}`;
}
