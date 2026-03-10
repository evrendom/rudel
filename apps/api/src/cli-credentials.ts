import { createHash, randomBytes } from "node:crypto";
import { pgClient } from "./db.js";

const DEFAULT_CLI_CREDENTIAL_TTL_DAYS = 90;

export interface IssuedCliCredential {
	id: string;
	token: string;
	expiresAt: Date;
}

export interface AuthenticatedCliCredential {
	id: string;
	userId: string;
	activeOrganizationId: string | null;
	expiresAt: Date;
	user: {
		id: string;
		email: string;
		name: string;
		image: string | null;
	};
}

interface AuthenticatedCliCredentialRow {
	id: string;
	user_id: string;
	active_organization_id: string | null;
	expires_at: Date | string;
	user_record_id: string;
	email: string;
	name: string;
	image: string | null;
}

function parsePositiveInt(
	value: string | undefined,
	fallback: number,
	min = 1,
): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < min) {
		return fallback;
	}
	return parsed;
}

function getCliCredentialTtlDays(): number {
	return parsePositiveInt(
		process.env.CLI_CREDENTIAL_TTL_DAYS,
		DEFAULT_CLI_CREDENTIAL_TTL_DAYS,
	);
}

function hashCliToken(token: string): string {
	return createHash("sha256").update(token).digest("base64url");
}

function createCliToken(): {
	prefix: string;
	token: string;
	tokenHash: string;
} {
	const prefix = `rcl_${randomBytes(8).toString("hex")}`;
	const secret = randomBytes(32).toString("base64url");
	const token = `${prefix}.${secret}`;
	return {
		prefix,
		token,
		tokenHash: hashCliToken(token),
	};
}

function getCliTokenPrefix(token: string): string | null {
	const separator = token.indexOf(".");
	if (separator <= 0) {
		return null;
	}
	return token.slice(0, separator);
}

export function normalizeCliDeviceName(
	deviceName: string | null | undefined,
): string {
	const trimmed = deviceName?.trim();
	if (!trimmed) {
		return "Rudel CLI";
	}
	return trimmed.slice(0, 128);
}

export async function issueCliCredential(input: {
	userId: string;
	activeOrganizationId?: string | null;
	deviceName?: string | null;
}): Promise<IssuedCliCredential> {
	const { prefix, token, tokenHash } = createCliToken();
	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + getCliCredentialTtlDays() * 24 * 60 * 60 * 1000,
	);
	const id = crypto.randomUUID();

	await pgClient`
		INSERT INTO cli_credential (
			id,
			user_id,
			token_prefix,
			token_hash,
			device_name,
			active_organization_id,
			last_used_at,
			expires_at,
			created_at,
			updated_at
		)
		VALUES (
			${id},
			${input.userId},
			${prefix},
			${tokenHash},
			${normalizeCliDeviceName(input.deviceName)},
			${input.activeOrganizationId ?? null},
			${now.toISOString()},
			${expiresAt.toISOString()},
			${now.toISOString()},
			${now.toISOString()}
		)
	`;

	return { id, token, expiresAt };
}

export async function authenticateCliCredential(
	token: string,
): Promise<AuthenticatedCliCredential | null> {
	const prefix = getCliTokenPrefix(token);
	if (!prefix) {
		return null;
	}

	const now = new Date();
	const nowIso = now.toISOString();
	const matches = await pgClient<AuthenticatedCliCredentialRow[]>`
		SELECT
			c.id,
			c.user_id,
			c.active_organization_id,
			c.expires_at,
			u.id AS user_record_id,
			u.email,
			u.name,
			u.image
		FROM cli_credential c
		INNER JOIN "user" u ON c.user_id = u.id
		WHERE c.token_prefix = ${prefix}
			AND c.token_hash = ${hashCliToken(token)}
			AND c.revoked_at IS NULL
			AND c.expires_at > ${nowIso}
		LIMIT 1
	`;

	const match = matches[0];
	if (!match) {
		return null;
	}

	await pgClient`
		UPDATE cli_credential
		SET last_used_at = ${nowIso}, updated_at = ${nowIso}
		WHERE id = ${match.id}
	`;

	return {
		id: match.id,
		userId: match.user_id,
		activeOrganizationId: match.active_organization_id ?? null,
		expiresAt:
			match.expires_at instanceof Date
				? match.expires_at
				: new Date(match.expires_at),
		user: {
			id: match.user_record_id,
			email: match.email,
			name: match.name,
			image: match.image ?? null,
		},
	};
}

export async function revokeCliCredential(
	credentialId: string,
	userId: string,
): Promise<void> {
	const nowIso = new Date().toISOString();
	await pgClient`
		UPDATE cli_credential
		SET revoked_at = ${nowIso}, updated_at = ${nowIso}
		WHERE id = ${credentialId}
			AND user_id = ${userId}
			AND revoked_at IS NULL
	`;
}
