import type { AppSession } from "@/features/auth/auth-route-utils";

const WRAPPED_COMPLETION_STORAGE_VERSION = "v1";
export const WRAPPED_LAUNCH_CUTOFF = new Date("2026-04-20T00:00:00.000Z");

export function isWrappedLaunchEligible(
	session: AppSession | null | undefined,
): boolean {
	const createdAt = getSessionUserCreatedAt(session);
	return createdAt ? createdAt >= WRAPPED_LAUNCH_CUTOFF : false;
}

export function hasCompletedWrapped(
	userId: string | null | undefined,
): boolean {
	const storageKey = getWrappedCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return false;
	}

	try {
		return window.localStorage.getItem(storageKey) === "true";
	} catch {
		return false;
	}
}

export function markWrappedCompleted(userId: string | null | undefined): void {
	const storageKey = getWrappedCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(storageKey, "true");
	} catch {}
}

export function clearWrappedCompleted(userId: string | null | undefined): void {
	const storageKey = getWrappedCompletionStorageKey(userId);
	if (!storageKey || typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.removeItem(storageKey);
	} catch {}
}

export function getWrappedCompletionStorageKey(
	userId: string | null | undefined,
): string | null {
	const normalizedUserId = userId?.trim();
	if (!normalizedUserId) {
		return null;
	}

	return `wrapped:completed:${WRAPPED_COMPLETION_STORAGE_VERSION}:${normalizedUserId}`;
}

function getSessionUserCreatedAt(
	session: AppSession | null | undefined,
): Date | null {
	const createdAt =
		session?.user &&
		"createdAt" in session.user &&
		(session.user.createdAt instanceof Date ||
			typeof session.user.createdAt === "string")
			? session.user.createdAt
			: null;

	if (!createdAt) {
		return null;
	}

	if (createdAt instanceof Date) {
		return Number.isNaN(createdAt.getTime()) ? null : createdAt;
	}

	const parsedCreatedAt = new Date(createdAt);
	return Number.isNaN(parsedCreatedAt.getTime()) ? null : parsedCreatedAt;
}
