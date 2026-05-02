export const EMAIL_CODE_LENGTH = 6;

export type EmailCodeStage = "email" | "code";

export type EmailAuthFeedback = {
	kind: "error" | "success";
	message: string;
} | null;

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
