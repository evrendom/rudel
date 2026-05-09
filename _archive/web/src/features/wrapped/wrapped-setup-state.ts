const WRAPPED_SETUP_COMPLETION_STORAGE_VERSION = "v1";

export function hasCompletedWrappedSetup(
	userId: string | null | undefined,
): boolean {
	const storageKey = getWrappedSetupCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return false;
	}

	try {
		return window.localStorage.getItem(storageKey) === "true";
	} catch {
		return false;
	}
}

export function markWrappedSetupCompleted(
	userId: string | null | undefined,
): void {
	const storageKey = getWrappedSetupCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(storageKey, "true");
	} catch {}
}

export function clearWrappedSetupCompleted(
	userId: string | null | undefined,
): void {
	const storageKey = getWrappedSetupCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.removeItem(storageKey);
	} catch {}
}

export function getWrappedSetupCompletionStorageKey(
	userId: string | null | undefined,
): string | null {
	const normalizedUserId = userId?.trim();
	if (!normalizedUserId) {
		return null;
	}

	return `wrapped:setup-completed:${WRAPPED_SETUP_COMPLETION_STORAGE_VERSION}:${normalizedUserId}`;
}
