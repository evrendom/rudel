import { z } from "zod";

const WRAPPED_GUEST_PREVIEW_STORAGE_KEY = "wrapped:guest-preview:v1";
const WRAPPED_GUEST_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const WrappedGuestFlowStepSchema = z.enum(["x-handle", "auth", "profile"]);
const WrappedGuestPreviewImageUrlSchema = z
	.union([
		z.string().url(),
		z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,/iu),
	])
	.nullable();

const WrappedGuestPreviewProfileSchema = z.object({
	displayName: z.string().min(1),
	followerCount: z.number().int().nonnegative().nullable(),
	imageUrl: WrappedGuestPreviewImageUrlSchema,
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
export interface WrappedGuestPreviewProfileUpdates {
	displayName?: string;
	imageUrl?: string | null;
}

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
		imageUrl: null,
		source: "local",
		username,
		verified: false,
	};
}

export function normalizeWrappedGuestPreviewProfile(
	profile: WrappedGuestPreviewProfile,
) {
	const normalizedUsername = normalizeWrappedGuestUsername(profile.username);

	return {
		...profile,
		displayName: profile.displayName.trim(),
		username: WRAPPED_GUEST_USERNAME_PATTERN.test(normalizedUsername)
			? normalizedUsername
			: profile.username,
	};
}

export function updateWrappedGuestPreviewProfile(input: {
	currentProfile: WrappedGuestPreviewProfile | null;
	fallbackValue?: string;
	updates: WrappedGuestPreviewProfileUpdates;
}) {
	const { currentProfile, fallbackValue = "you", updates } = input;
	const nextProfile =
		currentProfile ?? buildLocalWrappedGuestPreviewProfile(fallbackValue);

	if (!nextProfile) {
		return null;
	}

	const mergedProfile = {
		...nextProfile,
		...updates,
	};
	const normalizedUsername = normalizeWrappedGuestUsername(
		mergedProfile.username,
	);

	return {
		...mergedProfile,
		username: WRAPPED_GUEST_USERNAME_PATTERN.test(normalizedUsername)
			? normalizedUsername
			: mergedProfile.username,
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

		const snapshot = WrappedGuestPreviewSnapshotSchema.parse(
			JSON.parse(rawValue),
		);

		return {
			...snapshot,
			profile: normalizeWrappedGuestPreviewProfile(snapshot.profile),
		};
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
			JSON.stringify({
				...input,
				profile: normalizeWrappedGuestPreviewProfile(input.profile),
			}),
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
