import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRouter: ((sql: string, values: unknown[]) => unknown[]) | null = null;
let updateRouter: ((sql: string, values: unknown[]) => unknown[]) | null = null;

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });

	if (sql.startsWith("SELECT")) {
		if (!selectRouter) {
			throw new Error(`unexpected SELECT without router: ${sql}`);
		}
		return selectRouter(sql, values);
	}

	if (sql.startsWith("UPDATE")) {
		if (!updateRouter) {
			throw new Error(`unexpected UPDATE without router: ${sql}`);
		}
		return updateRouter(sql, values);
	}

	throw new Error(`Unexpected SQL query: ${sql}`);
}

mock.module("../db.js", () => ({
	sqlClient,
}));

const { getDecimalClaimEntitlement, redeemDecimalClaim } = await import(
	"../services/wrapped-decimal-claim.service.js"
);

const VALID_TOKEN = "wct_test_token_value_xyz";

function hashToken(token: string): Uint8Array {
	return createHash("sha256").update(token).digest();
}

describe("wrapped decimal claim service", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRouter = null;
		updateRouter = null;
	});

	test("getMine returns true when the user has a claimed row", async () => {
		selectRouter = () => [{ exists: 1 }];

		const result = await getDecimalClaimEntitlement("user-1");

		expect(result.entitled).toBe(true);
		expect(sqlQueries[0]?.values).toEqual(["user-1"]);
	});

	test("getMine returns false when no claimed row exists for the user", async () => {
		selectRouter = () => [];

		const result = await getDecimalClaimEntitlement("user-1");

		expect(result.entitled).toBe(false);
	});

	test("redeem grants when the token is unclaimed and the caller is not entitled", async () => {
		selectRouter = (sql) => {
			if (
				sql.includes("FROM wrapped_decimal_claim WHERE claimed_by_user_id =")
			) {
				return [];
			}
			throw new Error(`unexpected SELECT: ${sql}`);
		};
		updateRouter = (sql, values) => {
			expect(sql).toContain("UPDATE wrapped_decimal_claim");
			expect(sql).toContain("AND claimed_by_user_id IS NULL");
			expect(sql).toContain("RETURNING token_hash");
			expect(values[0]).toBe("user-1");
			return [{ tokenHash: hashToken(VALID_TOKEN) }];
		};

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "granted" });
	});

	test("redeem short-circuits to already_entitled when caller is already entitled", async () => {
		selectRouter = () => [{ exists: 1 }];
		updateRouter = () => {
			throw new Error("UPDATE must not run when caller is already entitled");
		};

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "already_entitled" });
		const updateQuery = sqlQueries.find((q) => q.sql.startsWith("UPDATE"));
		expect(updateQuery).toBeUndefined();
	});

	test("redeem returns invalid_or_used for a malformed token without touching the database", async () => {
		selectRouter = () => {
			throw new Error("SELECT must not run for a malformed token");
		};
		updateRouter = () => {
			throw new Error("UPDATE must not run for a malformed token");
		};

		const result = await redeemDecimalClaim({
			token: "not-a-real-token",
			userId: "user-1",
		});

		expect(result).toEqual({ status: "invalid_or_used" });
		expect(sqlQueries).toHaveLength(0);
	});

	test("redeem returns invalid_or_used when token row is missing", async () => {
		selectRouter = (sql) => {
			if (sql.includes("WHERE claimed_by_user_id =")) {
				return [];
			}
			if (sql.includes("WHERE token_hash =")) {
				return [];
			}
			throw new Error(`unexpected SELECT: ${sql}`);
		};
		updateRouter = () => [];

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "invalid_or_used" });
	});

	test("redeem returns invalid_or_used when token was claimed by someone else", async () => {
		selectRouter = (sql) => {
			if (sql.includes("WHERE claimed_by_user_id =")) {
				return [];
			}
			if (sql.includes("WHERE token_hash =")) {
				return [{ claimedByUserId: "another-user" }];
			}
			throw new Error(`unexpected SELECT: ${sql}`);
		};
		updateRouter = () => [];

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "invalid_or_used" });
	});

	test("redeem returns already_entitled when the same caller raced and claimed in another tab", async () => {
		// Pre-check sees no entitlement (race window). UPDATE matches no row
		// because the parallel call already flipped claimed_by_user_id. Token row
		// lookup confirms it is owned by this same caller.
		selectRouter = (sql) => {
			if (sql.includes("WHERE claimed_by_user_id =")) {
				return [];
			}
			if (sql.includes("WHERE token_hash =")) {
				return [{ claimedByUserId: "user-1" }];
			}
			throw new Error(`unexpected SELECT: ${sql}`);
		};
		updateRouter = () => [];

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "already_entitled" });
	});

	test("redeem maps a unique-violation from a parallel claim to already_entitled", async () => {
		// Race where the partial unique index on claimed_by_user_id catches the
		// caller trying to claim a second token. The DB throws SQLSTATE 23505;
		// the service surfaces it as already_entitled because the caller does
		// end up entitled — just via the row their other claim already won.
		selectRouter = () => [];
		updateRouter = () => {
			const error = new Error("duplicate key value violates unique constraint");
			(error as Error & { code: string }).code = "23505";
			throw error;
		};

		const result = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-1",
		});

		expect(result).toEqual({ status: "already_entitled" });
	});

	test("redeem hashes the token with sha256 before sending it to the database", async () => {
		const expected = hashToken(VALID_TOKEN);
		const observedHashes: Uint8Array[] = [];
		selectRouter = () => [];
		updateRouter = (_sql, values) => {
			observedHashes.push(values[1] as Uint8Array);
			return [{ tokenHash: expected }];
		};

		await redeemDecimalClaim({ token: VALID_TOKEN, userId: "user-1" });

		const observed = observedHashes[0];
		expect(observed).toBeDefined();
		expect(
			Buffer.from(observed as Uint8Array).equals(Buffer.from(expected)),
		).toBe(true);
	});

	test("two parallel redeems for the same token resolve to one granted and one invalid_or_used", async () => {
		// Simulate the post-commit observation: the first UPDATE consumes the
		// row, the second sees zero rows and a different claimed_by_user_id.
		// We cannot model the real row lock from the JS side, so we validate the
		// outcome each branch produces given those mock responses.
		const firstSelectRouter = () => [];
		const firstUpdateRouter = () => [{ tokenHash: hashToken(VALID_TOKEN) }];

		selectRouter = firstSelectRouter;
		updateRouter = firstUpdateRouter;

		const firstResult = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-A",
		});

		sqlQueries.length = 0;
		selectRouter = (sql) => {
			if (sql.includes("WHERE claimed_by_user_id =")) {
				return [];
			}
			if (sql.includes("WHERE token_hash =")) {
				return [{ claimedByUserId: "user-A" }];
			}
			throw new Error(`unexpected SELECT: ${sql}`);
		};
		updateRouter = () => [];

		const secondResult = await redeemDecimalClaim({
			token: VALID_TOKEN,
			userId: "user-B",
		});

		expect(firstResult).toEqual({ status: "granted" });
		expect(secondResult).toEqual({ status: "invalid_or_used" });
	});
});
