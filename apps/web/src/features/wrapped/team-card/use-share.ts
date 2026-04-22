import type {
	WrappedShareRecord,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import { useRef, useState } from "react";
import { appRoutes } from "@/app/routes";
import { client } from "@/lib/orpc";

type ShareRecordLookup = Record<string, WrappedShareRecord>;

interface UseWrappedTeamCardShareOptions {
	// Product analytics wants to know when a share record is first materialized.
	// We keep that callback optional so the hook stays reusable and does not own
	// analytics directly.
	onShareCreated?: (shareRecord: WrappedShareRecord) => void;
}

// This hook owns the "create a real share only when needed" behavior for the
// wrapped team card. The Saturday launch needs a public URL, but we only want
// to create it when the user actually enters the share flow.
export function useWrappedTeamCardShare(
	snapshot: WrappedShareSnapshot,
	options?: UseWrappedTeamCardShareOptions,
) {
	// Multiple buttons can ask for a share at roughly the same time. We keep the
	// in-flight promise in a ref so copy/share/download all collapse onto one
	// request per snapshot instead of creating duplicate share records.
	const shareRequestByKeyRef = useRef(
		new Map<string, Promise<WrappedShareRecord>>(),
	);
	const [shareRecordsByKey, setShareRecordsByKey] = useState<ShareRecordLookup>(
		{},
	);
	const [pendingShareKey, setPendingShareKey] = useState<string | null>(null);
	const { onShareCreated } = options ?? {};
	const snapshotKey = JSON.stringify(snapshot);
	const activeShareRecord = shareRecordsByKey[snapshotKey] ?? null;
	const shareUrl = activeShareRecord
		? buildWrappedShareUrl(activeShareRecord.id)
		: undefined;

	// ensureShare is the single entry point for "make sure this card has a real
	// public URL". It first reuses cached data, then reuses any in-flight request,
	// and only finally creates a new share if nothing exists yet.
	async function ensureShare() {
		if (activeShareRecord) {
			return activeShareRecord;
		}

		const pendingShareRequest = shareRequestByKeyRef.current.get(snapshotKey);
		if (pendingShareRequest) {
			return pendingShareRequest;
		}

		setPendingShareKey(snapshotKey);

		const shareRequest = client.wrappedShare
			.create({ snapshot })
			.then((createdShare) => {
				setShareRecordsByKey((currentRecords) => ({
					...currentRecords,
					[snapshotKey]: createdShare,
				}));
				onShareCreated?.(createdShare);
				return createdShare;
			})
			.finally(() => {
				shareRequestByKeyRef.current.delete(snapshotKey);
				setPendingShareKey((currentPendingShareKey) =>
					currentPendingShareKey === snapshotKey
						? null
						: currentPendingShareKey,
				);
			});

		shareRequestByKeyRef.current.set(snapshotKey, shareRequest);
		return shareRequest;
	}

	return {
		ensureShare,
		isCreatingShare: pendingShareKey === snapshotKey,
		shareUrl,
		shareUrlLabel: formatShareUrlLabel(
			shareUrl,
			pendingShareKey === snapshotKey,
		),
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
) {
	if (isCreatingShare) {
		return "Creating link...";
	}

	if (!shareUrl) {
		return appRoutes.wrappedTeamCard();
	}

	return shareUrl.replace(/^https?:\/\//u, "");
}
