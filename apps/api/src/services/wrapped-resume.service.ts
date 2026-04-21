import { sqlClient } from "../db.js";

interface CreateWrappedResumeOptions {
	email: string;
	shareId: string | null;
	userId: string;
}

interface WrappedResumeRow {
	email: string;
	expiresAt: Date;
	shareId: string | null;
	token: string;
	usedAt: Date | null;
}

export interface WrappedResumeRecord {
	email: string;
	expiresAt: string;
	shareId: string | null;
	token: string;
}

export type ConsumeWrappedResumeResult =
	| {
			redirectTo: string;
			shareId: string | null;
			status: "consumed";
	  }
	| {
			status: "email_mismatch" | "expired" | "missing" | "used";
	  };

const WRAPPED_RESUME_TTL_HOURS = 24;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// This table is intentionally product-specific. We only need one job:
// let a signed-in mobile user continue setup on desktop without inventing a
// generic auth or magic-link platform.
export async function createWrappedResume(
	options: CreateWrappedResumeOptions,
): Promise<WrappedResumeRecord> {
	const { email, shareId, userId } = options;
	const createdAt = new Date();
	const expiresAt = createWrappedResumeExpiry(createdAt);
	const normalizedEmail = normalizeEmail(email);
	const token = crypto.randomUUID();

	await sqlClient`
		INSERT INTO wrapped_resume (
			token,
			email,
			share_id,
			user_id,
			created_at,
			expires_at
		)
		VALUES (
			${token},
			${normalizedEmail},
			${shareId},
			${userId},
			${createdAt},
			${expiresAt}
		)
	`;

	return {
		email: normalizedEmail,
		expiresAt: expiresAt.toISOString(),
		shareId,
		token,
	};
}

// Consume is deliberately strict and early-return based so the security rules
// stay obvious:
// - token must exist
// - token must not be expired
// - token must not be used
// - signed-in desktop email must match the mobile email
export async function consumeWrappedResume(options: {
	email: string;
	token: string;
}): Promise<ConsumeWrappedResumeResult> {
	const { email, token } = options;
	const normalizedEmail = normalizeEmail(email);
	const row = await getWrappedResumeRow(token);

	if (!row) {
		return { status: "missing" };
	}

	if (row.usedAt) {
		return { status: "used" };
	}

	if (isWrappedResumeExpired(row.expiresAt)) {
		return { status: "expired" };
	}

	if (row.email !== normalizedEmail) {
		return { status: "email_mismatch" };
	}

	const wasMarkedUsed = await markWrappedResumeUsed(token);

	if (!wasMarkedUsed) {
		return { status: "used" };
	}

	return {
		redirectTo: buildGetStartedRedirect(row.shareId),
		shareId: row.shareId,
		status: "consumed",
	};
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function createWrappedResumeExpiry(createdAt: Date) {
	return new Date(
		createdAt.getTime() + WRAPPED_RESUME_TTL_HOURS * MILLISECONDS_PER_HOUR,
	);
}

function isWrappedResumeExpired(expiresAt: Date) {
	return expiresAt.getTime() <= Date.now();
}

async function getWrappedResumeRow(
	token: string,
): Promise<WrappedResumeRow | null> {
	const [row] = await sqlClient<Array<WrappedResumeRow>>`
		SELECT
			token,
			email,
			share_id AS "shareId",
			expires_at AS "expiresAt",
			used_at AS "usedAt"
		FROM wrapped_resume
		WHERE token = ${token}
		LIMIT 1
	`;

	return row ?? null;
}

async function markWrappedResumeUsed(token: string) {
	const updatedRows = await sqlClient<Array<{ token: string }>>`
		UPDATE wrapped_resume
		SET used_at = ${new Date()}
		WHERE token = ${token}
			AND used_at IS NULL
		RETURNING token
	`;

	return updatedRows.length === 1;
}

function buildGetStartedRedirect(shareId: string | null) {
	if (!shareId) {
		return "/get-started";
	}

	return `/get-started?share_id=${encodeURIComponent(shareId)}`;
}
