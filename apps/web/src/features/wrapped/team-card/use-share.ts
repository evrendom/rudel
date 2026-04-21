import type {
	WrappedShareRecord,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import { useRef, useState } from "react";
import { appRoutes } from "@/app/routes";
import { client } from "@/lib/orpc";

type ShareRecordLookup = Record<string, WrappedShareRecord>;

interface UseWrappedTeamCardShareOptions {
	onShareCreated?: (shareRecord: WrappedShareRecord) => void;
}

export function useWrappedTeamCardShare(
	snapshot: WrappedShareSnapshot,
	options?: UseWrappedTeamCardShareOptions,
) {
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

function buildWrappedShareUrl(shareId: string) {
	if (typeof window === "undefined") {
		return undefined;
	}

	return new URL(
		appRoutes.wrappedShare(shareId),
		window.location.origin,
	).toString();
}

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
