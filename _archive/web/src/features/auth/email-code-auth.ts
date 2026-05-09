export const EMAIL_CODE_LENGTH = 6;
const LOGIN_CODE_DRAFT_STORAGE_KEY = "rudel:email-login-code-draft";
const LOGIN_CODE_DRAFT_MAX_AGE_MS = 15 * 60 * 1000;

export type EmailCodeStage = "email" | "code";
export type EmailCodeAuthMode = "login" | "signup";

export type EmailAuthFeedback = {
	kind: "error" | "success";
	message: string;
} | null;

export interface PendingEmailLoginCodeDraft {
	email: string;
	mode: "login";
}

export interface PendingEmailSignupCodeDraft {
	email: string;
	mode: "signup";
}

export type PendingEmailCodeDraft =
	| PendingEmailLoginCodeDraft
	| PendingEmailSignupCodeDraft;

type StoredPendingEmailCodeDraft = PendingEmailCodeDraft & {
	updatedAt: number;
};

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

export function readPendingEmailCodeDraft(): PendingEmailCodeDraft | null {
	if (typeof window === "undefined") {
		return null;
	}

	let latestDraft: StoredPendingEmailCodeDraft | null = null;

	for (const storage of getDraftStorageAreas()) {
		const draft = readStoredPendingEmailCodeDraft(storage);
		if (!draft) {
			continue;
		}

		if (!latestDraft || draft.updatedAt > latestDraft.updatedAt) {
			latestDraft = draft;
		}
	}

	if (!latestDraft) {
		return null;
	}

	return {
		email: latestDraft.email,
		mode: latestDraft.mode,
	};
}

export function readPendingEmailLoginCodeDraft(): PendingEmailLoginCodeDraft | null {
	const draft = readPendingEmailCodeDraft();
	if (draft?.mode !== "login") {
		return null;
	}

	return draft;
}

export function readPendingEmailSignupCodeDraft(): PendingEmailSignupCodeDraft | null {
	const draft = readPendingEmailCodeDraft();
	if (draft?.mode !== "signup") {
		return null;
	}

	return draft;
}

export function writePendingEmailCodeDraft(
	mode: EmailCodeAuthMode,
	email: string,
) {
	if (typeof window === "undefined") {
		return;
	}

	const loginEmail = normalizeAuthEmail(email);
	if (!isValidAuthEmail(loginEmail)) {
		clearPendingEmailCodeDraft();
		return;
	}

	const draft: StoredPendingEmailCodeDraft = {
		email: loginEmail,
		mode,
		updatedAt: Date.now(),
	};
	const serializedDraft = JSON.stringify(draft);

	for (const storage of getDraftStorageAreas()) {
		writeStoredPendingEmailCodeDraft(storage, serializedDraft);
	}
}

export function writePendingEmailLoginCodeDraft(email: string) {
	writePendingEmailCodeDraft("login", email);
}

export function writePendingEmailSignupCodeDraft(email: string) {
	writePendingEmailCodeDraft("signup", email);
}

export function clearPendingEmailCodeDraft() {
	if (typeof window === "undefined") {
		return;
	}

	for (const storage of getDraftStorageAreas()) {
		removeStoredPendingEmailCodeDraft(storage);
	}
}

export function clearPendingEmailLoginCodeDraft() {
	clearPendingEmailCodeDraft();
}

function getDraftStorageAreas(): Storage[] {
	if (typeof window === "undefined") {
		return [];
	}

	return [
		getDraftStorageArea("localStorage"),
		getDraftStorageArea("sessionStorage"),
	].filter((storageArea) => storageArea !== null);
}

function getDraftStorageArea(
	storageName: "localStorage" | "sessionStorage",
): Storage | null {
	try {
		return storageName === "localStorage"
			? window.localStorage
			: window.sessionStorage;
	} catch {
		return null;
	}
}

function readStoredPendingEmailCodeDraft(
	storage: Storage,
): StoredPendingEmailCodeDraft | null {
	try {
		const rawDraft = storage.getItem(LOGIN_CODE_DRAFT_STORAGE_KEY);
		if (!rawDraft) {
			return null;
		}

		const parsed: unknown = JSON.parse(rawDraft);
		const draft = parseStoredPendingEmailCodeDraft(parsed);
		if (!draft) {
			removeStoredPendingEmailCodeDraft(storage);
			return null;
		}

		if (Date.now() - draft.updatedAt > LOGIN_CODE_DRAFT_MAX_AGE_MS) {
			removeStoredPendingEmailCodeDraft(storage);
			return null;
		}

		return draft;
	} catch {
		removeStoredPendingEmailCodeDraft(storage);
		return null;
	}
}

function writeStoredPendingEmailCodeDraft(
	storage: Storage,
	serializedDraft: string,
) {
	try {
		storage.setItem(LOGIN_CODE_DRAFT_STORAGE_KEY, serializedDraft);
	} catch {
		// Best effort only: the controlled inputs still retain state in memory.
	}
}

function removeStoredPendingEmailCodeDraft(storage: Storage) {
	try {
		storage.removeItem(LOGIN_CODE_DRAFT_STORAGE_KEY);
	} catch {
		// Ignore blocked storage.
	}
}

function parseStoredPendingEmailCodeDraft(
	value: unknown,
): StoredPendingEmailCodeDraft | null {
	if (!isRecord(value)) {
		return null;
	}

	const mode = getStoredPendingEmailCodeMode(value);

	if (
		typeof value.email !== "string" ||
		!isValidAuthEmail(value.email) ||
		mode === null ||
		typeof value.updatedAt !== "number" ||
		!Number.isFinite(value.updatedAt)
	) {
		return null;
	}

	return {
		email: value.email,
		mode,
		updatedAt: value.updatedAt,
	};
}

function getStoredPendingEmailCodeMode(
	value: Record<string, unknown>,
): EmailCodeAuthMode | null {
	if (value.mode === "login" || value.mode === "signup") {
		return value.mode;
	}

	if (!("mode" in value)) {
		return "login";
	}

	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
