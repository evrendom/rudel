export const EMAIL_CODE_LENGTH = 6;
const LOGIN_CODE_DRAFT_STORAGE_KEY = "rudel:email-login-code-draft";
const LOGIN_CODE_DRAFT_MAX_AGE_MS = 15 * 60 * 1000;

export type EmailCodeStage = "email" | "code";

export type EmailAuthFeedback = {
	kind: "error" | "success";
	message: string;
} | null;

export interface PendingEmailLoginCodeDraft {
	email: string;
}

export function normalizeAuthEmail(email: string) {
	return email.trim();
}

export function isValidAuthEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthEmail(email));
}

export function sanitizeEmailCodeInput(value: string) {
	return value.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}

export function isValidEmailCode(code: string) {
	return code.length === EMAIL_CODE_LENGTH;
}

export function readPendingEmailLoginCodeDraft(): PendingEmailLoginCodeDraft | null {
	if (typeof window === "undefined") {
		return null;
	}

	const rawDraft = window.sessionStorage.getItem(LOGIN_CODE_DRAFT_STORAGE_KEY);
	if (!rawDraft) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(rawDraft);
		if (!isStoredPendingEmailLoginCodeDraft(parsed)) {
			clearPendingEmailLoginCodeDraft();
			return null;
		}

		if (Date.now() - parsed.updatedAt > LOGIN_CODE_DRAFT_MAX_AGE_MS) {
			clearPendingEmailLoginCodeDraft();
			return null;
		}

		return { email: parsed.email };
	} catch {
		clearPendingEmailLoginCodeDraft();
		return null;
	}
}

export function writePendingEmailLoginCodeDraft(email: string) {
	if (typeof window === "undefined") {
		return;
	}

	const loginEmail = normalizeAuthEmail(email);
	if (!isValidAuthEmail(loginEmail)) {
		clearPendingEmailLoginCodeDraft();
		return;
	}

	try {
		window.sessionStorage.setItem(
			LOGIN_CODE_DRAFT_STORAGE_KEY,
			JSON.stringify({
				email: loginEmail,
				updatedAt: Date.now(),
			}),
		);
	} catch {
		// Best effort only: the controlled inputs still retain state in memory.
	}
}

export function clearPendingEmailLoginCodeDraft() {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.sessionStorage.removeItem(LOGIN_CODE_DRAFT_STORAGE_KEY);
	} catch {
		// Ignore blocked storage.
	}
}

export function hasPendingEmailLoginCodeDraft() {
	return readPendingEmailLoginCodeDraft() !== null;
}

function isStoredPendingEmailLoginCodeDraft(
	value: unknown,
): value is PendingEmailLoginCodeDraft & { updatedAt: number } {
	return (
		isRecord(value) &&
		typeof value.email === "string" &&
		isValidAuthEmail(value.email) &&
		typeof value.updatedAt === "number"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
