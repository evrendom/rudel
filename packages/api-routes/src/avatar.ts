export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_MULTIPART_BYTES = Math.floor(2.5 * 1024 * 1024);

export const AVATAR_ACCEPTED_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;
export type AvatarMimeType = (typeof AVATAR_ACCEPTED_MIME_TYPES)[number];

export const AVATAR_PUBLIC_ID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const AVATAR_URL_PATH_REGEX =
	/^\/api\/avatar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const AVATAR_TRUSTED_OAUTH_HOSTS = [
	"lh3.googleusercontent.com",
	"avatars.githubusercontent.com",
] as const;

export const AVATAR_CACHE_MAX_AGE_SECONDS = 300;
