import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let insertRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });

	if (sql.startsWith("SELECT")) {
		return selectRows;
	}

	if (sql.startsWith("INSERT")) {
		return insertRows;
	}

	if (sql.startsWith("DELETE")) {
		return [];
	}

	throw new Error(`Unexpected SQL query: ${sql}`);
}

mock.module("../db.js", () => ({
	sqlClient,
}));

const {
	deleteUserAvatarInTx,
	getUserAvatarByPublicId,
	getUserAvatarOwnerByPublicId,
	isAcceptedAvatarMimeType,
	sniffImageMimeType,
	upsertUserAvatarInTx,
} = await import("../services/avatar-upload.service.js");

describe("avatar upload service - magic byte sniffing", () => {
	test("recognizes a real PNG header", () => {
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xab, 0xcd,
		]);
		expect(sniffImageMimeType(png)).toBe("image/png");
	});

	test("recognizes a real JPEG header", () => {
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
		expect(sniffImageMimeType(jpeg)).toBe("image/jpeg");
	});

	test("recognizes a real WEBP header", () => {
		const webp = Buffer.from([
			0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
			0x00, 0x00,
		]);
		expect(sniffImageMimeType(webp)).toBe("image/webp");
	});

	test("rejects bytes that look like a script", () => {
		const evil = Buffer.from("<script>alert(1)</script>");
		expect(sniffImageMimeType(evil)).toBeNull();
	});

	test("rejects truncated input", () => {
		expect(sniffImageMimeType(Buffer.from([0x89]))).toBeNull();
	});
});

describe("avatar upload service - mime allowlist", () => {
	test("accepts each declared format", () => {
		expect(isAcceptedAvatarMimeType("image/png")).toBe(true);
		expect(isAcceptedAvatarMimeType("image/jpeg")).toBe(true);
		expect(isAcceptedAvatarMimeType("image/webp")).toBe(true);
	});

	test("rejects everything else", () => {
		expect(isAcceptedAvatarMimeType("image/gif")).toBe(false);
		expect(isAcceptedAvatarMimeType("image/svg+xml")).toBe(false);
		expect(isAcceptedAvatarMimeType("application/octet-stream")).toBe(false);
	});
});

describe("avatar upload service - read helpers", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		insertRows = [];
	});

	test("getUserAvatarByPublicId returns nothing when no row matches", async () => {
		const result = await getUserAvatarByPublicId(
			"12345678-1234-1234-1234-123456789abc",
		);
		expect(result).toBeNull();
		expect(sqlQueries).toHaveLength(1);
	});

	test("getUserAvatarByPublicId materializes the bytes payload", async () => {
		const bytes = Buffer.from([0x01, 0x02, 0x03]);
		selectRows = [
			{
				byte_length: 3,
				content_type: "image/png",
				image_data: new Uint8Array(bytes),
				image_hash: "deadbeef",
			},
		];
		const result = await getUserAvatarByPublicId(
			"12345678-1234-1234-1234-123456789abc",
		);
		expect(result?.contentType).toBe("image/png");
		expect(result?.imageHash).toBe("deadbeef");
		expect(result?.byteLength).toBe(3);
		expect(Buffer.compare(result?.bytes ?? Buffer.alloc(0), bytes)).toBe(0);
	});

	test("getUserAvatarOwnerByPublicId selects only the owning user_id", async () => {
		selectRows = [{ user_id: "user-1" }];
		const result = await getUserAvatarOwnerByPublicId(
			"12345678-1234-1234-1234-123456789abc",
		);
		expect(result?.userId).toBe("user-1");
		expect(getQuery(0).sql.startsWith("SELECT user_id")).toBe(true);
	});
});

describe("avatar upload service - write helpers", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		insertRows = [];
	});

	test("upsertUserAvatarInTx returns the assigned publicId", async () => {
		insertRows = [{ public_id: "12345678-1234-1234-1234-123456789abc" }];
		const result = await upsertUserAvatarInTx(
			sqlClient as unknown as Parameters<typeof upsertUserAvatarInTx>[0],
			{
				userId: "user-1",
				bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
				contentType: "image/png",
				imageHash: "abc",
			},
		);
		expect(result.publicId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
		);
		expect(getQuery(0).sql).toContain("INSERT INTO user_avatar");
		expect(getQuery(0).sql).toContain("ON CONFLICT (user_id) DO UPDATE");
	});

	test("upsertUserAvatarInTx errors when the database returns no row", async () => {
		insertRows = [];
		await expect(
			upsertUserAvatarInTx(
				sqlClient as unknown as Parameters<typeof upsertUserAvatarInTx>[0],
				{
					userId: "user-1",
					bytes: Buffer.from([0xff, 0xd8, 0xff]),
					contentType: "image/jpeg",
					imageHash: "abc",
				},
			),
		).rejects.toThrow("Failed to upsert user_avatar row");
	});

	test("deleteUserAvatarInTx fires a DELETE scoped by user_id", async () => {
		await deleteUserAvatarInTx(
			sqlClient as unknown as Parameters<typeof deleteUserAvatarInTx>[0],
			"user-1",
		);
		expect(getQuery(0).sql).toContain("DELETE FROM user_avatar");
		expect(getQuery(0).values[0]).toBe("user-1");
	});
});

function getQuery(index: number) {
	const query = sqlQueries[index];
	if (!query) {
		throw new Error(`Expected SQL query at index ${index}`);
	}
	return query;
}
