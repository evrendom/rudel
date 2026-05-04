import { createHash } from "node:crypto";
import type {
	RedeemWrappedDecimalClaimResult,
	WrappedDecimalClaimEntitlement,
} from "@rudel/api-routes";
import { WrappedDecimalClaimTokenSchema } from "@rudel/api-routes";
import { sqlClient } from "../db.js";

// Postgres unique-violation SQLSTATE. Surfaced when the partial unique index
// on wrapped_decimal_claim.claimed_by_user_id catches a parallel claim by the
// same user. We treat it as already_entitled, since the caller does end up
// entitled — just via a different row.
const POSTGRES_UNIQUE_VIOLATION = "23505";

interface MaybeSqlError {
	code?: string;
}

function hashClaimToken(rawToken: string): Uint8Array {
	return createHash("sha256").update(rawToken).digest();
}

// Cheap entitlement read for the frontend. Same query is used as the gate
// inside redeem so the two cannot disagree about who counts as entitled.
export async function getDecimalClaimEntitlement(
	userId: string,
): Promise<WrappedDecimalClaimEntitlement> {
	const rows = await sqlClient<Array<{ exists: number }>>`
		SELECT 1 AS "exists"
		FROM wrapped_decimal_claim
		WHERE claimed_by_user_id = ${userId}
		LIMIT 1
	`;

	return { entitled: rows.length > 0 };
}

// Single-use redemption. Order is intentional:
//   1. Pre-check entitlement so a second valid token stays unclaimed.
//   2. Atomic UPDATE with `claimed_by_user_id IS NULL` — only one concurrent
//      caller can match.
//   3. If the UPDATE matched no row, fall back to inspecting the token row to
//      distinguish "this caller already claimed it" from "someone else did /
//      token does not exist".
//
// The partial unique index on claimed_by_user_id is defense-in-depth in case a
// race slips between steps 1 and 2; we surface that as already_entitled.
export async function redeemDecimalClaim(input: {
	token: string;
	userId: string;
}): Promise<RedeemWrappedDecimalClaimResult> {
	const { token, userId } = input;

	// Reject malformed tokens here so the redeem endpoint always produces a
	// product-level result. The frontend can call redeem unconditionally and
	// show one fallback for invalid_or_used.
	const parsedToken = WrappedDecimalClaimTokenSchema.safeParse(token);

	if (!parsedToken.success) {
		return { status: "invalid_or_used" };
	}

	const existingEntitlement = await getDecimalClaimEntitlement(userId);

	if (existingEntitlement.entitled) {
		return { status: "already_entitled" };
	}

	const tokenHash = hashClaimToken(parsedToken.data);

	let claimedRows: Array<{ tokenHash: Uint8Array }>;

	try {
		claimedRows = await sqlClient<Array<{ tokenHash: Uint8Array }>>`
			UPDATE wrapped_decimal_claim
			SET
				claimed_by_user_id = ${userId},
				claimed_at = NOW()
			WHERE token_hash = ${tokenHash}
				AND claimed_by_user_id IS NULL
			RETURNING token_hash AS "tokenHash"
		`;
	} catch (error) {
		const sqlError = error as MaybeSqlError;
		if (sqlError?.code === POSTGRES_UNIQUE_VIOLATION) {
			return { status: "already_entitled" };
		}
		throw error;
	}

	if (claimedRows.length > 0) {
		return { status: "granted" };
	}

	// UPDATE matched nothing. Either the token does not exist, was already
	// claimed by someone else, or was just claimed by this same user in another
	// tab between the pre-check and the UPDATE. Disambiguate by reading.
	const tokenRows = await sqlClient<Array<{ claimedByUserId: string | null }>>`
		SELECT claimed_by_user_id AS "claimedByUserId"
		FROM wrapped_decimal_claim
		WHERE token_hash = ${tokenHash}
		LIMIT 1
	`;

	const claimedByUserId = tokenRows[0]?.claimedByUserId ?? null;

	if (claimedByUserId === userId) {
		return { status: "already_entitled" };
	}

	return { status: "invalid_or_used" };
}
