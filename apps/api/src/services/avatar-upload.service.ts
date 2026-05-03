import { randomUUID } from "node:crypto";
import {
	AVATAR_ACCEPTED_MIME_TYPES,
	type AvatarMimeType,
} from "@rudel/api-routes";
import type { Sql } from "postgres";
import { sqlClient } from "../db.js";

// postgres-js types its TransactionSql with `Omit<Sql, ...>`, which strips the
// call signature, so we just type the tx parameter as a Sql to keep the tagged
// template usable. Runtime behavior is identical.
type Tx = Sql;

// Accept only files whose first bytes match the literal magic-byte signature for
// one of the formats in AVATAR_ACCEPTED_MIME_TYPES. Don't trust the client's
// declared MIME type — a renamed `<script>` arrives with `Content-Type: image/png`
// otherwise.
export function sniffImageMimeType(bytes: Uint8Array): AvatarMimeType | null {
	if (bytes.length >= 8) {
		if (
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		) {
			return "image/png";
		}
	}

	if (bytes.length >= 3) {
		if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
			return "image/jpeg";
		}
	}

	if (bytes.length >= 12) {
		const isRiff =
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46;
		const isWebp =
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50;
		if (isRiff && isWebp) {
			return "image/webp";
		}
	}

	return null;
}

export function isAcceptedAvatarMimeType(
	mimeType: string,
): mimeType is AvatarMimeType {
	return (AVATAR_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export async function upsertUserAvatarInTx(
	tx: Tx,
	input: {
		userId: string;
		bytes: Buffer;
		contentType: AvatarMimeType;
		imageHash: string;
	},
): Promise<{ publicId: string }> {
	const { userId, bytes, contentType, imageHash } = input;
	const newPublicId = randomUUID();

	const [row] = await tx<Array<{ public_id: string }>>`
		INSERT INTO user_avatar (
			user_id, public_id, content_type, image_hash, image_data, byte_length, updated_at
		) VALUES (
			${userId},
			${newPublicId},
			${contentType},
			${imageHash},
			${bytes},
			${bytes.byteLength},
			NOW()
		)
		ON CONFLICT (user_id) DO UPDATE SET
			content_type = EXCLUDED.content_type,
			image_hash = EXCLUDED.image_hash,
			image_data = EXCLUDED.image_data,
			byte_length = EXCLUDED.byte_length,
			updated_at = NOW()
		RETURNING public_id
	`;

	if (!row) {
		throw new Error("Failed to upsert user_avatar row");
	}

	return { publicId: row.public_id };
}

export async function deleteUserAvatarInTx(
	tx: Tx,
	userId: string,
): Promise<void> {
	await tx`DELETE FROM user_avatar WHERE user_id = ${userId}`;
}

export async function getUserAvatarByPublicId(publicId: string): Promise<{
	bytes: Buffer;
	contentType: string;
	byteLength: number;
	imageHash: string;
} | null> {
	const [row] = await sqlClient<
		Array<{
			byte_length: number;
			content_type: string;
			image_data: Uint8Array;
			image_hash: string;
		}>
	>`
		SELECT content_type, image_hash, image_data, byte_length
		FROM user_avatar
		WHERE public_id = ${publicId}
		LIMIT 1
	`;

	if (!row) {
		return null;
	}

	return {
		bytes: Buffer.from(row.image_data),
		contentType: row.content_type,
		byteLength: row.byte_length,
		imageHash: row.image_hash,
	};
}

export async function getUserAvatarOwnerByPublicId(
	publicId: string,
): Promise<{ userId: string } | null> {
	const [row] = await sqlClient<Array<{ user_id: string }>>`
		SELECT user_id
		FROM user_avatar
		WHERE public_id = ${publicId}
		LIMIT 1
	`;

	if (!row) {
		return null;
	}

	return { userId: row.user_id };
}
