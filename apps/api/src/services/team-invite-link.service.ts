import { Buffer } from "node:buffer";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
	organizationId: string;
	organizationName: string;
	token: string;
}

const TEAM_INVITE_TOKEN_VERSION = "v1";
const LOCAL_TEAM_INVITE_SECRET = "rudel-local-team-invite-secret";

export async function getTeamInviteLink(input: {
	organizationId: string;
	userId: string;
}): Promise<TeamInviteLink | null> {
	const organization = await getManageableOrganization(input);

	if (!organization) {
		return null;
	}

	return {
		organizationId: organization.id,
		organizationName: organization.name,
		token: createTeamInviteToken(organization.id),
	};
}

export async function acceptTeamInviteLink(input: {
	token: string;
	userId: string;
}): Promise<TeamInviteAcceptResult> {
	const organizationId = getOrganizationIdFromTeamInviteToken(input.token);

	if (!organizationId) {
		return { status: "missing" };
	}

	const organization = await getOrganization(organizationId);

	if (!organization) {
		return { status: "missing" };
	}

	const existingMember = await getOrganizationMember({
		organizationId,
		userId: input.userId,
	});

	if (existingMember) {
		return {
			organizationId: organization.id,
			organizationName: organization.name,
			status: "already_member",
		};
	}

	await addOrganizationMember({
		organizationId,
		userId: input.userId,
	});

	return {
		organizationId: organization.id,
		organizationName: organization.name,
		status: "joined",
	};
}

function createTeamInviteToken(organizationId: string) {
	const payload = toBase64Url(organizationId);
	const signature = signTeamInvitePayload(payload);

	return `${TEAM_INVITE_TOKEN_VERSION}.${payload}.${signature}`;
}

function getOrganizationIdFromTeamInviteToken(token: string) {
	const parts = token.split(".");

	if (parts.length !== 3) {
		return null;
	}

	const [version, payload, signature] = parts;

	if (
		version !== TEAM_INVITE_TOKEN_VERSION ||
		!payload ||
		!signature ||
		!safeEqual(signature, signTeamInvitePayload(payload))
	) {
		return null;
	}

	return fromBase64Url(payload);
}

function signTeamInvitePayload(payload: string) {
	return createHmac("sha256", getTeamInviteSecret())
		.update(`${TEAM_INVITE_TOKEN_VERSION}.${payload}`)
		.digest("base64url");
}

function getTeamInviteSecret() {
	return process.env.BETTER_AUTH_SECRET ?? LOCAL_TEAM_INVITE_SECRET;
}

function safeEqual(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}

function toBase64Url(value: string) {
	return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
	try {
		const decoded = Buffer.from(value, "base64url").toString("utf8");
		return decoded.length > 0 ? decoded : null;
	} catch {
		return null;
	}
}

async function getManageableOrganization(input: {
	organizationId: string;
	userId: string;
}) {
	const [organization] = await sqlClient<
		Array<{ id: string; name: string; role: string }>
	>`
		SELECT
			o.id,
			o.name,
			m.role
		FROM organization o
		INNER JOIN member m
			ON m.organization_id = o.id
		WHERE o.id = ${input.organizationId}
			AND m.user_id = ${input.userId}
		LIMIT 1
	`;

	if (
		!organization ||
		(organization.role !== "owner" && organization.role !== "admin")
	) {
		return null;
	}

	return organization;
}

async function getOrganization(organizationId: string) {
	const [organization] = await sqlClient<Array<{ id: string; name: string }>>`
		SELECT id, name
		FROM organization
		WHERE id = ${organizationId}
		LIMIT 1
	`;

	return organization ?? null;
}

async function getOrganizationMember(input: {
	organizationId: string;
	userId: string;
}) {
	const [member] = await sqlClient<Array<{ id: string }>>`
		SELECT id
		FROM member
		WHERE organization_id = ${input.organizationId}
			AND user_id = ${input.userId}
		LIMIT 1
	`;

	return member ?? null;
}

async function addOrganizationMember(input: {
	organizationId: string;
	userId: string;
}) {
	await sqlClient`
		INSERT INTO member (
			id,
			organization_id,
			user_id,
			role,
			created_at
		)
		SELECT
			${randomUUID()},
			${input.organizationId},
			${input.userId},
			'member',
			${new Date().toISOString()}
		WHERE NOT EXISTS (
			SELECT 1
			FROM member
			WHERE organization_id = ${input.organizationId}
				AND user_id = ${input.userId}
		)
	`;
}
