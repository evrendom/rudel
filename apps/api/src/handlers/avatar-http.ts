import { createHash } from "node:crypto";
import { getLogger } from "@logtape/logtape";
import {
	AVATAR_CACHE_MAX_AGE_SECONDS,
	AVATAR_MAX_BYTES,
	AVATAR_MAX_MULTIPART_BYTES,
	AVATAR_PUBLIC_ID_REGEX,
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

export async function handleAvatarUploadRequest(input: {
	cors: Record<string, string>;
	getSession: SessionResolver;
	request: Request;
}): Promise<Response> {
	const { cors, getSession, request } = input;

	const session = await getSession(request);
	if (!session?.user || !session?.session) {
		return new Response("Unauthorized", { status: 401, headers: cors });
	}

	const contentLengthHeader = request.headers.get("Content-Length");
	if (contentLengthHeader === null) {
		return new Response("Length Required", { status: 411, headers: cors });
	}
	const contentLengthValue = Number(contentLengthHeader);
	if (
		!Number.isFinite(contentLengthValue) ||
		contentLengthValue > AVATAR_MAX_MULTIPART_BYTES
	) {
		return new Response("Payload Too Large", { status: 413, headers: cors });
	}

	let file: unknown;
	try {
		const formData = await request.formData();
		file = formData.get("file");
	} catch {
		return new Response("Invalid multipart body", {
			status: 400,
			headers: cors,
		});
	}

	if (!(file instanceof File)) {
		return new Response("Missing file field", { status: 400, headers: cors });
	}

	if (file.size > AVATAR_MAX_BYTES) {
		return new Response("Payload Too Large", { status: 413, headers: cors });
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const contentType = sniffImageMimeType(bytes);
	if (!contentType) {
		return new Response("Unsupported Media Type", {
			status: 415,
			headers: cors,
		});
	}

	const imageHash = createHash("sha256").update(bytes).digest("hex");
	const userId = session.user.id;

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
		logger.error("Avatar upload failed: {error}", { error: String(error) });
		return new Response("Internal Server Error", {
			status: 500,
			headers: cors,
		});
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
		return new Response("Not Found", { status: 404, headers: cors });
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
