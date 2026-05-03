import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });
	if (sql.startsWith("SELECT")) return selectRows;
	throw new Error(`Unexpected SQL query: ${sql}`);
}
sqlClient.begin = async <T>(fn: (tx: typeof sqlClient) => Promise<T>) =>
	fn(sqlClient);

mock.module("../db.js", () => ({
	sqlClient,
}));

const { validateProfileImage } = await import("../handlers/profile.js");

const OWN_AVATAR_PATH = "/api/avatar/12345678-1234-1234-1234-123456789abc";

describe("validateProfileImage", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
	});

	test("accepts null and clears the image", async () => {
		expect(await validateProfileImage({ image: null, userId: "user-1" })).toBe(
			null,
		);
		expect(sqlQueries).toHaveLength(0);
	});

	test("accepts the caller's own avatar URL", async () => {
		selectRows = [{ user_id: "user-1" }];
		const result = await validateProfileImage({
			image: OWN_AVATAR_PATH,
			userId: "user-1",
		});
		expect(result).toBe(OWN_AVATAR_PATH);
		expect(sqlQueries[0]?.sql.startsWith("SELECT user_id")).toBe(true);
	});

	test("rejects another user's avatar URL", async () => {
		selectRows = [{ user_id: "someone-else" }];
		await expect(
			validateProfileImage({ image: OWN_AVATAR_PATH, userId: "user-1" }),
		).rejects.toThrow();
	});

	test("rejects an unknown avatar publicId", async () => {
		selectRows = [];
		await expect(
			validateProfileImage({ image: OWN_AVATAR_PATH, userId: "user-1" }),
		).rejects.toThrow();
	});

	test("rejects malformed avatar relative paths", async () => {
		await expect(
			validateProfileImage({
				image: "/api/avatar/not-a-uuid",
				userId: "user-1",
			}),
		).rejects.toThrow();
	});

	test("accepts allowed Google avatar host", async () => {
		const result = await validateProfileImage({
			image: "https://lh3.googleusercontent.com/abc",
			userId: "user-1",
		});
		expect(result).toBe("https://lh3.googleusercontent.com/abc");
	});

	test("accepts allowed GitHub avatar host", async () => {
		const result = await validateProfileImage({
			image: "https://avatars.githubusercontent.com/u/42",
			userId: "user-1",
		});
		expect(result).toBe("https://avatars.githubusercontent.com/u/42");
	});

	test("rejects http (insecure) URLs", async () => {
		await expect(
			validateProfileImage({
				image: "http://lh3.googleusercontent.com/abc",
				userId: "user-1",
			}),
		).rejects.toThrow();
	});

	test("rejects data: URLs", async () => {
		await expect(
			validateProfileImage({
				image: "data:image/png;base64,abc",
				userId: "user-1",
			}),
		).rejects.toThrow();
	});

	test("rejects untrusted HTTPS hosts", async () => {
		await expect(
			validateProfileImage({
				image: "https://evil.example.com/a.png",
				userId: "user-1",
			}),
		).rejects.toThrow();
	});

	test("rejects foreign relative paths", async () => {
		await expect(
			validateProfileImage({ image: "/foo", userId: "user-1" }),
		).rejects.toThrow();
	});
});
