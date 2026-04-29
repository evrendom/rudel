import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let updateRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });

	if (sql.startsWith("SELECT")) {
		return selectRows;
	}

	if (sql.startsWith("UPDATE")) {
		return updateRows;
	}

	if (sql.startsWith("INSERT")) {
		return [];
	}

	throw new Error(`Unexpected SQL query: ${sql}`);
}

mock.module("../db.js", () => ({
	sqlClient,
}));

const { consumeWrappedResume, createWrappedResume } = await import(
	"../services/wrapped-resume.service.js"
);

describe("wrapped resume service", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		updateRows = [];
	});

	test("creates a one-day resume token record for the normalized account email", async () => {
		const createdBefore = Date.now();

		const record = await createWrappedResume({
			email: " Ada@Example.COM ",
			shareId: "share-123",
			userId: "user-1",
		});

		expect(record.email).toBe("ada@example.com");
		expect(record.shareId).toBe("share-123");
		expect(record.token).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
		);
		expect(new Date(record.expiresAt).getTime()).toBeGreaterThan(
			createdBefore + 23 * 60 * 60 * 1000,
		);

		const insertQuery = getSqlQuery(0);
		expect(insertQuery.sql.startsWith("INSERT INTO wrapped_resume")).toBe(true);
		expect(insertQuery.values[1]).toBe("ada@example.com");
		expect(insertQuery.values[2]).toBe("share-123");
		expect(insertQuery.values[3]).toBe("user-1");
	});

	test("consumes a valid token and redirects to wrapped", async () => {
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				shareId: null,
				token: "token-1",
				usedAt: null,
			},
		];
		updateRows = [{ token: "token-1" }];

		const result = await consumeWrappedResume({
			email: " ADA@Example.COM ",
			token: "token-1",
		});

		expect(result).toEqual({
			redirectTo: "/wrapped",
			shareId: null,
			status: "consumed",
		});
		expect(getSqlQuery(1).sql.startsWith("UPDATE wrapped_resume")).toBe(true);
	});

	test("preserves share attribution when consuming a valid token", async () => {
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				shareId: "share-123",
				token: "token-1",
				usedAt: null,
			},
		];
		updateRows = [{ token: "token-1" }];

		const result = await consumeWrappedResume({
			email: "ada@example.com",
			token: "token-1",
		});

		expect(result).toEqual({
			redirectTo: "/wrapped?share_id=share-123",
			shareId: "share-123",
			status: "consumed",
		});
	});

	test("rejects a token that belongs to another email without marking it used", async () => {
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				shareId: null,
				token: "token-1",
				usedAt: null,
			},
		];

		const result = await consumeWrappedResume({
			email: "grace@example.com",
			token: "token-1",
		});

		expect(result).toEqual({ status: "email_mismatch" });
		expect(sqlQueries).toHaveLength(1);
	});

	test("rejects expired and already-used tokens without marking them used", async () => {
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() - 60_000).toISOString(),
				shareId: null,
				token: "expired-token",
				usedAt: null,
			},
		];

		expect(
			await consumeWrappedResume({
				email: "ada@example.com",
				token: "expired-token",
			}),
		).toEqual({ status: "expired" });
		expect(sqlQueries).toHaveLength(1);

		sqlQueries.length = 0;
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				shareId: null,
				token: "used-token",
				usedAt: new Date().toISOString(),
			},
		];

		expect(
			await consumeWrappedResume({
				email: "ada@example.com",
				token: "used-token",
			}),
		).toEqual({ status: "used" });
		expect(sqlQueries).toHaveLength(1);
	});

	test("treats a token as used when another request claims it first", async () => {
		selectRows = [
			{
				email: "ada@example.com",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				shareId: null,
				token: "token-1",
				usedAt: null,
			},
		];
		updateRows = [];

		const result = await consumeWrappedResume({
			email: "ada@example.com",
			token: "token-1",
		});

		expect(result).toEqual({ status: "used" });
		expect(getSqlQuery(1).sql.startsWith("UPDATE wrapped_resume")).toBe(true);
	});
});

function getSqlQuery(index: number) {
	const query = sqlQueries[index];

	if (!query) {
		throw new Error(`Expected SQL query at index ${index}`);
	}

	return query;
}
