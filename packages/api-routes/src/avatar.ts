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

// Stable error codes for the avatar upload endpoint. The server returns these
// in the JSON body of every non-200 response so the web client can map them to
// targeted messages instead of a single generic "try again" toast.
export const AVATAR_UPLOAD_ERROR_CODES = [
	"unauthorized",
	"length_required",
	"request_too_large",
	"invalid_multipart",
	"missing_file",
	"file_too_large",
	"unsupported_image_type",
	"server_error",
] as const;
export type AvatarUploadErrorCode = (typeof AVATAR_UPLOAD_ERROR_CODES)[number];

export interface AvatarUploadErrorBody {
	error: AvatarUploadErrorCode;
	message: string;
	limit?: number;
	requestId?: string;
}

export function isAvatarUploadErrorCode(
	value: unknown,
): value is AvatarUploadErrorCode {
	return (
		typeof value === "string" &&
		(AVATAR_UPLOAD_ERROR_CODES as readonly string[]).includes(value)
	);
}
