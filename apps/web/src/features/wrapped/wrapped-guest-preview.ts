import { z } from "zod";

const WRAPPED_GUEST_PREVIEW_STORAGE_KEY = "wrapped:guest-preview:v1";
const WRAPPED_GUEST_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const WRAPPED_GUEST_UNAVATAR_BASE_URL = "https://unavatar.io/x/";

const WrappedGuestFlowStepSchema = z.enum(["x-handle", "auth"]);

const WrappedGuestPreviewProfileSchema = z.object({
	displayName: z.string().min(1),
	followerCount: z.number().int().nonnegative().nullable(),
	imageUrl: z.string().url().nullable(),
	source: z.enum(["local", "x"]),
	username: z
		.string()
		.trim()
		.min(1)
		.max(15)
		.regex(WRAPPED_GUEST_USERNAME_PATTERN),
	verified: z.boolean(),
});

const WrappedGuestPreviewSnapshotSchema = z.object({
	profile: WrappedGuestPreviewProfileSchema,
	step: WrappedGuestFlowStepSchema,
});

export type WrappedGuestFlowStep = z.infer<typeof WrappedGuestFlowStepSchema>;
export type WrappedGuestPreviewProfile = z.infer<
	typeof WrappedGuestPreviewProfileSchema
>;

export function normalizeWrappedGuestUsername(value: string) {
	return value.trim().replace(/^@+/u, "");
}

export function isWrappedGuestUsernameValid(value: string) {
	return WRAPPED_GUEST_USERNAME_PATTERN.test(
		normalizeWrappedGuestUsername(value),
	);
}

export function buildLocalWrappedGuestPreviewProfile(
	value: string,
): WrappedGuestPreviewProfile | null {
	const username = normalizeWrappedGuestUsername(value);

	if (!WRAPPED_GUEST_USERNAME_PATTERN.test(username)) {
		return null;
	}

	return {
		displayName: formatWrappedGuestDisplayName(username),
		followerCount: null,
		imageUrl: buildWrappedGuestAvatarUrl(username),
		source: "local",
		username,
		verified: false,
	};
}

export function readWrappedGuestPreviewSnapshot(): {
	profile: WrappedGuestPreviewProfile;
	step: WrappedGuestFlowStep;
} | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.sessionStorage.getItem(
			WRAPPED_GUEST_PREVIEW_STORAGE_KEY,
		);

		if (!rawValue) {
			return null;
		}

		const snapshot = WrappedGuestPreviewSnapshotSchema.parse(JSON.parse(rawValue));
		return normalizeWrappedGuestPreviewSnapshot(snapshot);
	} catch {
		return null;
	}
}

export function writeWrappedGuestPreviewSnapshot(input: {
	profile: WrappedGuestPreviewProfile;
	step: WrappedGuestFlowStep;
}) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.sessionStorage.setItem(
			WRAPPED_GUEST_PREVIEW_STORAGE_KEY,
			JSON.stringify(input),
		);
	} catch {}
}

export function clearWrappedGuestPreviewSnapshot() {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.sessionStorage.removeItem(WRAPPED_GUEST_PREVIEW_STORAGE_KEY);
	} catch {}
}

function formatWrappedGuestDisplayName(username: string) {
	const cleanedUsername = username.replace(/[_-]+/gu, " ").trim();

	if (!cleanedUsername) {
		return username;
	}

	return cleanedUsername.replace(/\b\w/gu, (character) =>
		character.toUpperCase(),
	);
}

function buildWrappedGuestAvatarUrl(username: string) {
	return `${WRAPPED_GUEST_UNAVATAR_BASE_URL}${encodeURIComponent(username)}`;
}

function normalizeWrappedGuestPreviewSnapshot(input: {
	profile: WrappedGuestPreviewProfile;
	step: WrappedGuestFlowStep;
}) {
	if (input.profile.imageUrl || input.profile.source !== "local") {
		return input;
	}

	return {
		...input,
		profile: {
			...input.profile,
			imageUrl: buildWrappedGuestAvatarUrl(input.profile.username),
		},
	};
}
