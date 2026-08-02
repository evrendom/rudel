import { beforeEach, describe, expect, mock, test } from "bun:test";
import assert from "node:assert";
import {
	getWrappedShareSnapshotByteLength,
	WRAPPED_SHARE_RESOURCE_LIMITS,
	type WrappedShareSnapshot,
} from "@rudel/api-routes";
import {
	WRAPPED_SHARE_LOOKUP_MAX_REQUESTS,
	WRAPPED_SHARE_LOOKUP_SOURCE_MAX_REQUESTS,
} from "../rate-limit.js";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let selectRouter: ((sql: string, values: unknown[]) => unknown[]) | null = null;
let insertRows: unknown[] = [];
let updateRows: unknown[] = [];
let clickhouseRows: unknown[] = [];
const WRAPPED_SHARE_TEST_SOURCE = "wrapped-share-service-test";

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

mock.module("../clickhouse.js", () => ({
	queryClickhouse: () => Promise.resolve(clickhouseRows),
}));

const {
	createWrappedShare,
	getPublicWrappedShare,
	getPublicWrappedShareForPageMetadata,
	getPublicWrappedShareWithSocialImage,
} = await import("../services/wrapped-share.service.js");

describe("wrapped share service", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		selectRouter = null;
		insertRows = [];
		updateRows = [];
		clickhouseRows = [
			{
				commitSessions: 12,
				estimatedCostUsd: 42,
				unpricedSessionCount: 0,
				unpricedTokenCount: 0,
			},
		];
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

	test("persists the social image outside the replay snapshot", async () => {
		insertRows = [{ id: "evren" }];
		const socialImageDataUrl = createSocialImageDataUrl(3);

		await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			socialImageDataUrl,
			userId: "user-1",
			variant: "normal",
		});

		const insertQuery = getSqlQuery(2);
		const snapshotJson = insertQuery.values[3];
		assert.strictEqual(typeof snapshotJson, "string");
		expect(insertQuery.values[4]).toBe(socialImageDataUrl);
		expect(snapshotJson).not.toContain("socialImageDataUrl");
	});

	test("overrides client-authored spend fields with authoritative pricing", async () => {
		insertRows = [{ id: "evren" }];
		clickhouseRows = [
			{
				commitSessions: 4,
				estimatedCostUsd: 12.5,
				unpricedSessionCount: 0,
				unpricedTokenCount: 0,
			},
		];
		const snapshot = createSnapshot({ displayName: "Evren" });
		snapshot.row.cost = 999;
		snapshot.headerLeftMetric = {
			title: "$999 estimated spend",
			value: "$999",
		};
		snapshot.backMetrics = [
			{ label: "Spent", value: "999" },
			{ label: "Dollar per commit", value: "999" },
		];

		await createWrappedShare({
			organizationId: "org-1",
			snapshot,
			userId: "user-1",
			variant: "normal",
		});

		const snapshotJson = getSqlQuery(2).values[3];
		if (typeof snapshotJson !== "string") {
			throw new Error("expected the persisted wrapped snapshot to be JSON");
		}
		const persisted = JSON.parse(snapshotJson) as WrappedShareSnapshot;
		expect(persisted.row.cost).toBe(12.5);
		expect(persisted.headerLeftMetric?.value).toBe("$13");
		expect(persisted.backMetrics).toEqual([
			{ label: "Spent", value: "13" },
			{ label: "Dollar per commit", value: "3.13" },
		]);
	});

	test("refuses to publish a partial-cost snapshot", async () => {
		clickhouseRows = [
			{
				commitSessions: 0,
				estimatedCostUsd: 0,
				unpricedSessionCount: 1,
				unpricedTokenCount: 360,
			},
		];

		await expect(
			createWrappedShare({
				organizationId: "org-1",
				snapshot: createSnapshot({ displayName: "Evren" }),
				userId: "user-1",
				variant: "normal",
			}),
		).rejects.toThrow(/pricing is available for every session/u);
		expect(sqlQueries).toHaveLength(0);
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
		expect(getSqlQuery(1).values[5]).toBe("evren");
		expect(getSqlQuery(1).values[6]).toBe("user-1");
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
		expect(getSqlQuery(2).values[6]).toBe(legacyShareId);
		expect(getSqlQuery(2).values[7]).toBe("user-1");
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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(
			"https://avatars.githubusercontent.com/u/1?v=4",
		);
		expect(getSqlQuery(0).sql).toContain('LEFT JOIN "user"');
	});

	test("rejects throttled public RPC lookups before querying the database", async () => {
		const shareId = `throttled-rpc-share-${crypto.randomUUID()}`;
		const source = `throttled-rpc-source-${crypto.randomUUID()}`;

		for (
			let request = 0;
			request < WRAPPED_SHARE_LOOKUP_MAX_REQUESTS;
			request += 1
		) {
			await getPublicWrappedShare(shareId, source);
		}

		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS);
		await expect(getPublicWrappedShare(shareId, source)).rejects.toThrow(
			"Wrapped share lookup is temporarily rate limited",
		);
		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS);
	});

	test("rejects throttled page and image lookups before querying the database", async () => {
		const shareId = `throttled-social-share-${crypto.randomUUID()}`;
		const source = `throttled-social-source-${crypto.randomUUID()}`;

		for (
			let request = 0;
			request < WRAPPED_SHARE_LOOKUP_MAX_REQUESTS;
			request += 1
		) {
			await getPublicWrappedShareWithSocialImage(shareId, source);
		}

		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS);
		await expect(
			getPublicWrappedShareWithSocialImage(shareId, source),
		).rejects.toThrow("Wrapped share lookup is temporarily rate limited");
		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS);

		const pageShareId = `throttled-page-share-${crypto.randomUUID()}`;
		const pageSource = `throttled-page-source-${crypto.randomUUID()}`;

		for (
			let request = 0;
			request < WRAPPED_SHARE_LOOKUP_MAX_REQUESTS;
			request += 1
		) {
			await getPublicWrappedShareForPageMetadata(pageShareId, pageSource);
		}

		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS * 2);
		await expect(
			getPublicWrappedShareForPageMetadata(pageShareId, pageSource),
		).rejects.toThrow("Wrapped share lookup is temporarily rate limited");
		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_MAX_REQUESTS * 2);
	});

	test("rejects source churn before loading another attacker-chosen ID", async () => {
		const source = `churning-source-${crypto.randomUUID()}`;

		for (
			let request = 0;
			request < WRAPPED_SHARE_LOOKUP_SOURCE_MAX_REQUESTS;
			request += 1
		) {
			await getPublicWrappedShare(
				`churning-share-${crypto.randomUUID()}`,
				source,
			);
		}

		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_SOURCE_MAX_REQUESTS);
		await expect(
			getPublicWrappedShare(`churning-share-${crypto.randomUUID()}`, source),
		).rejects.toThrow("Wrapped share lookup is temporarily rate limited");
		expect(sqlQueries).toHaveLength(WRAPPED_SHARE_LOOKUP_SOURCE_MAX_REQUESTS);
	});

	test("loads the largest supported public card without selecting its social image", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						backMetricCount: WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount,
						displayName: "Evren",
						statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
					}),
				),
				socialImageDataUrl: createSocialImageDataUrl(
					WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
				),
				userImage: null,
			},
		];

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		assert(share);
		expect(share.snapshot.statItems).toHaveLength(
			WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
		);
		expect(share.snapshot.backMetrics).toHaveLength(
			WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount,
		);
		expect(getSqlQuery(0).sql).toContain(
			"octet_length(wrapped_share.snapshot_json)",
		);
		expect(getSqlQuery(0).sql).not.toContain("social_image_data_url");
		expect(getSqlQuery(0).values).toEqual([
			"evren",
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		]);
	});

	test("loads the social image only for the specialized card-image lookup", async () => {
		const socialImageDataUrl = createSocialImageDataUrl(
			WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
		);
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(createSnapshot({ displayName: "Evren" })),
				socialImageDataUrl,
				userImage: null,
			},
		];

		const share = await getPublicWrappedShareWithSocialImage(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		assert(share);
		expect(share.socialImageDataUrl).toBe(socialImageDataUrl);
		expect(getSqlQuery(0).sql).toContain("social_image_data_url");
		expect(getSqlQuery(0).sql).toContain(
			"octet_length(wrapped_share.social_image_data_url)",
		);
	});

	test("checks image availability for page metadata without selecting the blob", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				hasSocialImage: true,
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(createSnapshot({ displayName: "Evren" })),
				userImage: null,
			},
		];

		const share = await getPublicWrappedShareForPageMetadata(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		assert(share);
		expect(share.hasSocialImage).toBe(true);
		expect(getSqlQuery(0).sql).toContain(
			'wrapped_share.social_image_data_url IS NOT NULL AS "hasSocialImage"',
		);
		expect(getSqlQuery(0).sql).not.toContain('AS "socialImageDataUrl"');
	});

	test("fails closed when a legacy row has one stat item over the limit", async () => {
		selectRows = [
			{
				createdAt: "2026-04-22T10:00:00.000Z",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				id: "evren",
				payloadVersion: 1,
				snapshotJson: JSON.stringify(
					createSnapshot({
						displayName: "Evren",
						statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
					}),
				),
				userImage: null,
			},
		];

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		expect(share).toBeNull();
	});

	test("rejects oversized creation before querying the database", async () => {
		await expect(
			createWrappedShare({
				organizationId: "org-1",
				snapshot: createSnapshot({
					displayName: "Evren",
					statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
				}),
				userId: "user-1",
				variant: "normal",
			}),
		).rejects.toThrow();
		expect(sqlQueries).toHaveLength(0);
	});

	test("rejects aggregate snapshot bytes before querying the database", async () => {
		const maximumText = "界".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.textLength);
		const snapshot = createSnapshot({
			backMetricCount: WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount,
			displayName: maximumText,
			imageUrl: "界".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength),
			shellClassName: "界".repeat(
				WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength,
			),
			statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
			text: maximumText,
		});

		expect(getWrappedShareSnapshotByteLength(snapshot)).toBeGreaterThan(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		);
		await expect(
			createWrappedShare({
				organizationId: "org-1",
				snapshot,
				userId: "user-1",
				variant: "normal",
			}),
		).rejects.toThrow(/Wrapped share snapshot must be at most/u);
		expect(sqlQueries).toHaveLength(0);
	});

	test("rejects an oversized social image before querying the database", async () => {
		await expect(
			createWrappedShare({
				organizationId: "org-1",
				snapshot: createSnapshot({ displayName: "Evren" }),
				socialImageDataUrl: createSocialImageDataUrl(
					WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes + 1,
				),
				userId: "user-1",
				variant: "normal",
			}),
		).rejects.toThrow(/social image must be at most/u);
		expect(sqlQueries).toHaveLength(0);
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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren-decimal",
			WRAPPED_SHARE_TEST_SOURCE,
		);

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

		const share = await getPublicWrappedShare(
			"evren",
			WRAPPED_SHARE_TEST_SOURCE,
		);

		assert(share);
		expect(share.snapshot.row.imageUrl).toBe(
			"https://lh3.googleusercontent.com/old",
		);
	});
});

function createSnapshot(input: {
	backMetricCount?: number;
	displayName: string;
	imageUrl?: string | null;
	shellClassName?: string;
	statItemCount?: number;
	text?: string;
}): WrappedShareSnapshot {
	const text = input.text ?? "x";

	return {
		archetypeLabel: text,
		backMetrics: Array.from({ length: input.backMetricCount ?? 0 }, () => ({
			label: text,
			value: text,
		})),
		headerLeftMetric: { label: text, title: text, value: text },
		headerRightMetric: { label: text, title: text, value: text },
		row: {
			activeDays: 6,
			cost: 42,
			displayName: input.displayName,
			favoriteModel: text,
			hasActivity: true,
			imageUrl: input.imageUrl ?? null,
			inputTokens: 120,
			lastActiveDate: text,
			outputTokens: 240,
			role: text,
			totalSessions: 12,
			totalTokens: 360,
		},
		shellClassName: input.shellClassName ?? "team-lineup-shell",
		statItems: Array.from({ length: input.statItemCount ?? 0 }, (_, index) => ({
			key: `stat-${index}`,
			label: text,
			title: text,
			value: text,
		})),
		theme: "light",
	};
}

function createSocialImageDataUrl(byteLength: number) {
	const prefix = "data:image/png;base64,";
	const base64Length = Math.ceil(byteLength / 3) * 4;
	const paddingLength = (3 - (byteLength % 3)) % 3;

	return (
		prefix +
		"A".repeat(base64Length - paddingLength) +
		"=".repeat(paddingLength)
	);
}

function getSqlQuery(index: number) {
	const query = sqlQueries[index];

	if (!query) {
		throw new Error(`Expected SQL query at index ${index}`);
	}

	return query;
}
