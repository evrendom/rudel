import { createHash, randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { sqlClient } from "../db.js";

export type TeamInviteAcceptResult =
	| {
			organizationId: string;
			organizationName: string;
			status: "already_member" | "joined";
	  }
	| {
			status: "missing";
	  };

export interface TeamInviteLink {
	expiresAt: string;
	organizationId: string;
	organizationName: string;
	token: string;
}

interface TeamInviteOrganization {
	id: string;
	name: string;
}

const TEAM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEAM_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export async function createTeamInviteLink(input: {
	organizationId: string;
	userId: string;
}): Promise<TeamInviteLink | null> {
	const token = randomBytes(32).toString("base64url");
	const tokenHash = hashTeamInviteToken(token);
	const now = Date.now();
	const createdAt = new Date(now).toISOString();
	const expiresAt = new Date(now + TEAM_INVITE_TTL_MS).toISOString();

	return sqlClient.begin(async (transaction) => {
		const organization = await getManageableOrganization(transaction, input);

		if (!organization) {
			return null;
		}

		await revokeActiveTeamInviteLink(transaction, organization.id, createdAt);
		await transaction.unsafe(
			`
			INSERT INTO team_invite_link (
				id,
				organization_id,
				creator_id,
				token_hash,
				created_at,
				expires_at
			)
			VALUES ($1, $2, $3, $4, $5, $6)
			`,
			[
				randomUUID(),
				organization.id,
				input.userId,
				tokenHash,
				createdAt,
				expiresAt,
			],
		);

		return {
			expiresAt,
			organizationId: organization.id,
			organizationName: organization.name,
			token,
		};
	});
}

export async function revokeTeamInviteLink(input: {
	organizationId: string;
	userId: string;
}): Promise<boolean> {
	return sqlClient.begin(async (transaction) => {
		const organization = await getManageableOrganization(transaction, input);

		if (!organization) {
			return false;
		}

		await revokeActiveTeamInviteLink(
			transaction,
			organization.id,
			new Date().toISOString(),
		);
		return true;
	});
}

export async function acceptTeamInviteLink(input: {
	token: string;
	userId: string;
}): Promise<TeamInviteAcceptResult> {
	if (!TEAM_INVITE_TOKEN_PATTERN.test(input.token)) {
		return { status: "missing" };
	}

	return sqlClient.begin(async (transaction) => {
		const organization = await getOrganizationForTeamInvite(
			transaction,
			hashTeamInviteToken(input.token),
		);
		if (!organization) {
			return { status: "missing" };
		}

		const joined = await addOrganizationMember(
			transaction,
			organization.id,
			input.userId,
		);
		return {
			organizationId: organization.id,
			organizationName: organization.name,
			status: joined ? "joined" : "already_member",
		};
	});
}

async function getManageableOrganization(
	transaction: postgres.TransactionSql,
	input: {
		organizationId: string;
		userId: string;
	},
) {
	const [organization] = await transaction.unsafe<TeamInviteOrganization[]>(
		`
		SELECT o.id, o.name
		FROM organization o
		INNER JOIN member m
			ON m.organization_id = o.id
		WHERE o.id = $1
			AND m.user_id = $2
			AND m.role IN ('owner', 'admin')
		LIMIT 1
		-- Stay compatible with the KEY SHARE lock used by the member foreign key.
		FOR NO KEY UPDATE OF o
		`,
		[input.organizationId, input.userId],
	);

	return organization ?? null;
}

async function revokeActiveTeamInviteLink(
	transaction: postgres.TransactionSql,
	organizationId: string,
	revokedAt: string,
) {
	await transaction.unsafe(
		`
		UPDATE team_invite_link
		SET revoked_at = $1
		WHERE organization_id = $2
			AND revoked_at IS NULL
		`,
		[revokedAt, organizationId],
	);
}

async function getOrganizationForTeamInvite(
	transaction: postgres.TransactionSql,
	tokenHash: string,
) {
	const [organization] = await transaction.unsafe<TeamInviteOrganization[]>(
		`
		SELECT o.id, o.name
		FROM team_invite_link i
		INNER JOIN organization o
			ON o.id = i.organization_id
		WHERE i.token_hash = $1
			AND i.revoked_at IS NULL
			AND i.expires_at > $2
		LIMIT 1
		FOR UPDATE OF i
		`,
		[tokenHash, new Date().toISOString()],
	);

	return organization ?? null;
}

async function addOrganizationMember(
	transaction: postgres.TransactionSql,
	organizationId: string,
	userId: string,
) {
	const [member] = await transaction.unsafe<Array<{ id: string }>>(
		`
		INSERT INTO member (
			id,
			organization_id,
			user_id,
			role,
			created_at
		)
		SELECT
			$1,
			$2,
			$3,
			'member',
			$4
		WHERE NOT EXISTS (
			SELECT 1
			FROM member
			WHERE organization_id = $2
				AND user_id = $3
		)
		RETURNING id
		`,
		[randomUUID(), organizationId, userId, new Date().toISOString()],
	);

	return member !== undefined;
}

function hashTeamInviteToken(token: string) {
	return createHash("sha256").update(token).digest("base64url");
}
