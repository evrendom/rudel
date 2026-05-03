import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WrappedShareSnapshot } from "@rudel/api-routes";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let insertRows: unknown[] = [];
let updateRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });

	if (sql.startsWith("SELECT")) {
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

const { createWrappedShare } = await import(
	"../services/wrapped-share.service.js"
);

describe("wrapped share service", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		insertRows = [];
		updateRows = [];
	});

	test("creates a name-based link for a user without an existing share", async () => {
		insertRows = [{ id: "evren" }];

		const record = await createWrappedShare({
			organizationId: "org-1",
			snapshot: createSnapshot({ displayName: "Evren" }),
			userId: "user-1",
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
});

function createSnapshot(input: { displayName: string }): WrappedShareSnapshot {
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
			imageUrl: null,
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
