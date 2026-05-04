import { createHash } from "node:crypto";
import { getLogger } from "@logtape/logtape";
import {
	AVATAR_CACHE_MAX_AGE_SECONDS,
	AVATAR_MAX_BYTES,
	AVATAR_MAX_MULTIPART_BYTES,
	AVATAR_PUBLIC_ID_REGEX,
	type AvatarUploadErrorBody,
	type AvatarUploadErrorCode,
} from "@rudel/api-routes";
import type { Sql } from "postgres";
import type { Session as AuthSession } from "../auth.js";
import { sqlClient } from "../db.js";
import {
	getUserAvatarByPublicId,
	sniffImageMimeType,
	upsertUserAvatarInTx,
} from "../services/avatar-upload.service.js";

const logger = getLogger(["rudel", "api", "avatar"]);

type SessionResolver = (request: Request) => Promise<AuthSession | null>;

export async function handleAvatarGetRequest(input: {
	cors: Record<string, string>;
	ifNoneMatch: string | null;
	method: "GET" | "HEAD";
	pathname: string;
}): Promise<Response> {
	const { cors, ifNoneMatch, method, pathname } = input;
	const publicId = pathname.slice("/api/avatar/".length);

	if (!AVATAR_PUBLIC_ID_REGEX.test(publicId)) {
		return new Response("Not Found", { status: 404, headers: cors });
	}

	const avatar = await getUserAvatarByPublicId(publicId);
	if (!avatar) {
		return new Response("Not Found", { status: 404, headers: cors });
	}

	const etag = `"${avatar.imageHash}"`;
	const baseHeaders: Record<string, string> = {
		...cors,
		"Cache-Control": `public, max-age=${AVATAR_CACHE_MAX_AGE_SECONDS}`,
		ETag: etag,
	};

	if (ifNoneMatch && ifNoneMatch === etag) {
		return new Response(null, { status: 304, headers: baseHeaders });
	}

	return new Response(method === "HEAD" ? null : avatar.bytes, {
		status: 200,
		headers: {
			...baseHeaders,
			"Content-Type": avatar.contentType,
			"Content-Length": avatar.byteLength.toString(),
		},
	});
}

interface AvatarUploadFailure {
	code: AvatarUploadErrorCode;
	message: string;
	status: number;
	limit?: number;
}

const FAILURES = {
	unauthorized: {
		code: "unauthorized",
		message: "Your session expired. Refresh the page and sign in again.",
		status: 401,
	},
	length_required: {
		code: "length_required",
		message: "Upload was missing a Content-Length header.",
		status: 411,
	},
	request_too_large: {
		code: "request_too_large",
		message: "Upload was larger than the request limit.",
		status: 413,
		limit: AVATAR_MAX_MULTIPART_BYTES,
	},
	invalid_multipart: {
		code: "invalid_multipart",
		message: "We could not read the upload. Try selecting the file again.",
		status: 400,
	},
	missing_file: {
		code: "missing_file",
		message: "No file was attached to the upload.",
		status: 400,
	},
	file_too_large: {
		code: "file_too_large",
		message: "Image must be 2 MB or smaller after we resize it.",
		status: 413,
		limit: AVATAR_MAX_BYTES,
	},
	unsupported_image_type: {
		code: "unsupported_image_type",
		message:
			"We could not read that image. Save it as PNG or JPEG and try again.",
		status: 415,
	},
	server_error: {
		code: "server_error",
		message: "Something broke on our side. Try again in a moment.",
		status: 500,
	},
} as const satisfies Record<AvatarUploadErrorCode, AvatarUploadFailure>;

function buildErrorResponse(
	failure: AvatarUploadFailure,
	cors: Record<string, string>,
	requestId: string | null,
): Response {
	const body: AvatarUploadErrorBody = {
		error: failure.code,
		message: failure.message,
	};
	if (failure.limit !== undefined) {
		body.limit = failure.limit;
	}
	if (requestId) {
		body.requestId = requestId;
	}
	return new Response(JSON.stringify(body), {
		status: failure.status,
		headers: {
			...cors,
			"Content-Type": "application/json",
		},
	});
}

export async function handleAvatarUploadRequest(input: {
	cors: Record<string, string>;
	getSession: SessionResolver;
	request: Request;
	requestId: string | null;
}): Promise<Response> {
	const { cors, getSession, request, requestId } = input;
	const respond = (failure: AvatarUploadFailure) =>
		buildErrorResponse(failure, cors, requestId);

	const session = await getSession(request);
	if (!session?.user || !session?.session) {
		logger.warn("Avatar upload rejected: unauthorized");
		return respond(FAILURES.unauthorized);
	}

	const userId = session.user.id;
	const contentLengthHeader = request.headers.get("Content-Length");
	if (contentLengthHeader === null) {
		logger.warn(
			"Avatar upload rejected: missing Content-Length (user_id={userId})",
			{ userId },
		);
		return respond(FAILURES.length_required);
	}
	const contentLengthValue = Number(contentLengthHeader);
	if (
		!Number.isFinite(contentLengthValue) ||
		contentLengthValue > AVATAR_MAX_MULTIPART_BYTES
	) {
		logger.warn(
			"Avatar upload rejected: request too large (user_id={userId} content_length={contentLength} limit={limit})",
			{
				contentLength: contentLengthHeader,
				limit: AVATAR_MAX_MULTIPART_BYTES,
				userId,
			},
		);
		return respond(FAILURES.request_too_large);
	}

	let file: unknown;
	try {
		const formData = await request.formData();
		file = formData.get("file");
	} catch (error) {
		logger.warn(
			"Avatar upload rejected: invalid multipart body (user_id={userId} error={error})",
			{ error: String(error), userId },
		);
		return respond(FAILURES.invalid_multipart);
	}

	if (!(file instanceof File)) {
		logger.warn(
			"Avatar upload rejected: missing file field (user_id={userId})",
			{ userId },
		);
		return respond(FAILURES.missing_file);
	}

	if (file.size > AVATAR_MAX_BYTES) {
		logger.warn(
			"Avatar upload rejected: file too large (user_id={userId} file_size={fileSize} limit={limit} content_type={contentType})",
			{
				contentType: file.type,
				fileSize: file.size,
				limit: AVATAR_MAX_BYTES,
				userId,
			},
		);
		return respond(FAILURES.file_too_large);
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const contentType = sniffImageMimeType(bytes);
	if (!contentType) {
		logger.warn(
			"Avatar upload rejected: unsupported image type (user_id={userId} declared_content_type={declaredContentType} file_size={fileSize})",
			{
				declaredContentType: file.type || "unknown",
				fileSize: file.size,
				userId,
			},
		);
		return respond(FAILURES.unsupported_image_type);
	}

	const imageHash = createHash("sha256").update(bytes).digest("hex");

	let publicId: string;
	try {
		const result = await sqlClient.begin(async (rawTx) => {
			const tx = rawTx as unknown as Sql;
			const upsert = await upsertUserAvatarInTx(tx, {
				userId,
				bytes,
				contentType,
				imageHash,
			});
			const newImageUrl = `/api/avatar/${upsert.publicId}`;
			await tx`
				UPDATE "user"
				SET image = ${newImageUrl},
					updated_at = NOW()
				WHERE id = ${userId}
			`;
			return upsert.publicId;
		});
		publicId = result;
	} catch (error) {
		logger.error(
			"Avatar upload failed: server error (user_id={userId} error={error})",
			{ error: String(error), userId },
		);
		return respond(FAILURES.server_error);
	}

	const [row] = await sqlClient<
		Array<{ email: string; id: string; image: string | null; name: string }>
	>`
		SELECT id, email, name, image
		FROM "user"
		WHERE id = ${userId}
		LIMIT 1
	`;

	if (!row) {
		logger.error(
			"Avatar upload succeeded but user row missing (user_id={userId})",
			{ userId },
		);
		return respond(FAILURES.server_error);
	}

	const activeOrganizationId =
		((session.session as Record<string, unknown>).activeOrganizationId as
			| string
			| null) ?? null;

	const body = JSON.stringify({
		user: {
			id: row.id,
			email: row.email,
			name: row.name,
			image: row.image ?? null,
			activeOrganizationId,
		},
	});

	return new Response(body, {
		status: 200,
		headers: {
			...cors,
			"Content-Type": "application/json",
			"X-Avatar-Public-Id": publicId,
		},
	});
}
