import { beforeEach, describe, expect, mock, test } from "bun:test";
import assert from "node:assert";
import type { WrappedShareSnapshot } from "@rudel/api-routes";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let selectRouter: ((sql: string, values: unknown[]) => unknown[]) | null = null;
let insertRows: unknown[] = [];
let updateRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });

	if (sql.startsWith("SELECT")) {
		if (selectRouter) {
			return selectRouter(sql, values);
		}
		return selectRows;
	}

	if (sql.startsWith("INSERT")) {
		return insertRows;
	}

	if (sql.startsWith("UPDATE")) {
		return updateRows;
	}

	throw new Error(`Unexpected SQL query: ${sql}`);
}

mock.module("../db.js", () => ({
	sqlClient,
}));

const { createWrappedShare, getPublicWrappedShare } = await import(
	"../services/wrapped-share.service.js"
);

describe("wrapped share service", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		selectRouter = null;
		insertRows = [];
		updateRows = [];
	});

	test("creates a name-based link for a user without an existing share", async () => {
		insertRows = [{ id: "evren" }];

		const record = await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
			variant: "normal",
		});

		expect(record.id).toBe("evren");
		expect(getSqlQuery(0).sql.startsWith("SELECT id, created_at")).toBe(true);
		expect(getSqlQuery(1).sql.startsWith("SELECT id FROM wrapped_share")).toBe(
			true,
		);
		expect(getSqlQuery(1).values).toEqual(["evren", 6, "-evren", "-evren-"]);
		expect(getSqlQuery(2).sql.startsWith("INSERT INTO wrapped_share")).toBe(
			true,
		);
		expect(getSqlQuery(2).values[0]).toBe("evren");
	});

	test("keeps the same link for later creates by the same user", async () => {
		const existingCreatedAt = "2026-04-22T10:00:00.000Z";
		selectRows = [{ createdAt: existingCreatedAt, id: "evren" }];
		updateRows = [{ id: "evren" }];

		const record = await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
			variant: "normal",
		});

		expect(record.id).toBe("evren");
		expect(record.created_at).toBe(existingCreatedAt);
		expect(sqlQueries).toHaveLength(2);
		expect(getSqlQuery(1).sql.startsWith("UPDATE wrapped_share")).toBe(true);
		expect(getSqlQuery(1).values[4]).toBe("evren");
		expect(getSqlQuery(1).values[5]).toBe("user-1");
	});

	test("renames a legacy uuid link to the card name for the same user", async () => {
		const existingCreatedAt = "2026-04-22T10:00:00.000Z";
		const legacyShareId = "c5f69df0-324a-4d15-a45a-3d32b87ac0c1";
		selectRows = [{ createdAt: existingCreatedAt, id: legacyShareId }];
		updateRows = [{ id: "evren" }];

		const record = await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
			variant: "normal",
		});

		expect(record.id).toBe("evren");
		expect(record.created_at).toBe(existingCreatedAt);
		expect(sqlQueries).toHaveLength(3);
		expect(getSqlQuery(1).values).toEqual([
			"evren",
			6,
			"-evren",
			"-evren-",
			legacyShareId,
		]);
		expect(getSqlQuery(2).sql.startsWith("UPDATE wrapped_share")).toBe(true);
		expect(getSqlQuery(2).values[0]).toBe("evren");
		expect(getSqlQuery(2).values[5]).toBe(legacyShareId);
		expect(getSqlQuery(2).values[6]).toBe("user-1");
	});

	test("hydrates an older public share without an image from the account profile", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({ displayName: "Evren", imageUrl: null }),
				),
				userImage: "https://avatars.githubusercontent.com/u/1?v=4",
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(
			"https://avatars.githubusercontent.com/u/1?v=4",
		);
		expect(getSqlQuery(0).sql).toContain('LEFT JOIN "user"');
	});

	test("keeps a saved share image ahead of the account profile fallback", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: "data:image/png;base64,saved",
					}),
				),
				userImage: "https://avatars.githubusercontent.com/u/1?v=4",
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe("data:image/png;base64,saved");
	});

	test("does not hydrate public shares from unsafe account profile images", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({ displayName: "Evren", imageUrl: null }),
				),
				userImage: "http://avatars.example.com/u/1.png",
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBeNull();
	});

	test("hydrates a missing snapshot image with the user's relative avatar path", async () => {
		const avatarPath = "/api/avatar/12345678-1234-1234-1234-123456789abc";
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({ displayName: "Evren", imageUrl: null }),
				),
				userImage: avatarPath,
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(avatarPath);
	});

	test("clears a non-avatar relative path from the user profile", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({ displayName: "Evren", imageUrl: null }),
				),
				userImage: "/foo",
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBeNull();
	});

	test("rewrites a stale avatar snapshot path to the user's current avatar", async () => {
		const oldAvatarPath = "/api/avatar/11111111-1111-1111-1111-111111111111";
		const newAvatarPath = "/api/avatar/22222222-2222-2222-2222-222222222222";
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: oldAvatarPath,
					}),
				),
				userImage: newAvatarPath,
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(newAvatarPath);
	});

	test("clears a stale avatar snapshot path when the user has cleared their avatar", async () => {
		const oldAvatarPath = "/api/avatar/11111111-1111-1111-1111-111111111111";
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: oldAvatarPath,
					}),
				),
				userImage: null,
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBeNull();
	});

	test("rewrites a stale avatar snapshot path when the user switched to a Google avatar", async () => {
		const oldAvatarPath = "/api/avatar/11111111-1111-1111-1111-111111111111";
		const googleUrl = "https://lh3.googleusercontent.com/abc";
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: oldAvatarPath,
					}),
				),
				userImage: googleUrl,
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(googleUrl);
	});

	test("preserves a snapshot that pins the user's current avatar path", async () => {
		const avatarPath = "/api/avatar/12345678-1234-1234-1234-123456789abc";
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: avatarPath,
					}),
				),
				userImage: avatarPath,
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(avatarPath);
	});

	test("rejects decimal share creation when the user has no claim row", async () => {
		selectRouter = (sql) => {
			if (sql.includes("FROM wrapped_decimal_claim")) {
				return [];
			}
			throw new Error(`unexpected select before entitlement gate: ${sql}`);
		};

		await expect(
			createWrappedShare({
				organizationId: "org-1",
				snapshot: createSnapshot({ displayName: "Evren" }),
				userId: "user-1",
				variant: "decimal",
			}),
		).rejects.toThrow(/Decimal wrapped is not available/);
		expect(getSqlQuery(0).sql).toContain("FROM wrapped_decimal_claim");
		expect(getSqlQuery(0).values).toEqual(["user-1"]);
	});

	test("creates a decimal slug when the user has an entitlement row", async () => {
		selectRouter = (sql) => {
			if (sql.includes("FROM wrapped_decimal_claim")) {
				return [{ exists: 1 }];
			}
			return [];
		};
		insertRows = [{ id: "evren-decimal" }];

		const record = await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
			variant: "decimal",
		});

		expect(record.id).toBe("evren-decimal");
		expect(record.variant).toBe("decimal");
		const insertQuery = sqlQueries.find((q) =>
			q.sql.startsWith("INSERT INTO wrapped_share"),
		);
		assert(insertQuery);
		expect(insertQuery.values[0]).toBe("evren-decimal");
		expect(insertQuery.values).toContain("decimal");
	});

	test("scopes the per-user share lookup by variant so normal and decimal rows coexist", async () => {
		selectRouter = (sql) => {
			if (sql.includes("FROM wrapped_decimal_claim")) {
				return [{ exists: 1 }];
			}
			if (
				sql.includes("FROM wrapped_share") &&
				sql.includes("user_id =") &&
				sql.includes("variant =")
			) {
				return [];
			}
			return [];
		};
		insertRows = [{ id: "evren-decimal" }];

		await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
			variant: "decimal",
		});

		const userShareLookup = sqlQueries.find(
			(q) =>
				q.sql.startsWith("SELECT id, created_at") &&
				q.sql.includes("variant ="),
		);
		assert(userShareLookup);
		expect(userShareLookup.values).toEqual(["user-1", "decimal"]);
	});

	test("returns variant on the public share response", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren-decimal",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({ displayName: "Evren", imageUrl: null }),
				),
				userImage: null,
				variant: "decimal",
			},
		];

		const share = await getPublicWrappedShare("evren-decimal");

		assert(share);
		expect(share.variant).toBe("decimal");
	});

	test("freezes a non-avatar snapshot url even when the user profile changes", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						imageUrl: "https://lh3.googleusercontent.com/old",
					}),
				),
				userImage: "https://lh3.googleusercontent.com/new",
			},
		];

		const share = await getPublicWrappedShare("evren");

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(
			"https://lh3.googleusercontent.com/old",
		);
	});
});

function createSnapshot(input: {
	displayName: string;
	imageUrl?: string | null;
}): WrappedShareSnapshot {
	return {
		archetypeLabel: "Builder",
		backMetrics: [],
		headerLeftMetric: { label: "Sessions", value: "12" },
		headerRightMetric: { label: "Days", value: "6" },
		row: {
			activeDays: 6,
			cost: 42,
			displayName: input.displayName,
			favoriteModel: "o3",
			hasActivity: true,
			imageUrl: input.imageUrl ?? null,
			inputTokens: 120,
			lastActiveDate: "2026-04-22",
			outputTokens: 240,
			role: "Builder",
			totalSessions: 12,
			totalTokens: 360,
		},
		shellClassName: "team-lineup-shell",
		statItems: [],
		theme: "light",
	};
}

function getSqlQuery(index: number) {
	const query = sqlQueries[index];

	if (!query) {
		throw new Error(`Expected SQL query at index ${index}`);
	}

	return query;
}
