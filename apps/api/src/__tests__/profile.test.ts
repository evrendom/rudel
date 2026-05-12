import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
const executionEvents: string[] = [];
let selectRows: unknown[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	executionEvents.push(sql);
	sqlQueries.push({ sql, values });
	if (sql.startsWith("SELECT")) return selectRows;
	if (sql.startsWith("DELETE") || sql.startsWith("UPDATE")) return [];
	throw new Error(`Unexpected SQL query: ${sql}`);
}
sqlClient.begin = async <T>(fn: (tx: typeof sqlClient) => Promise<T>) =>
	fn(sqlClient);

mock.module("../db.js", () => ({
	sqlClient,
}));

let deleteUserSessionsImpl: (userId: string) => Promise<void> = async () => {
	executionEvents.push("clickhouse");
};
const deleteUserSessionsCalls: string[] = [];
const deleteUserSessions = mock(async (userId: string) => {
	deleteUserSessionsCalls.push(userId);
	return deleteUserSessionsImpl(userId);
});

interface NotifyCall {
	deletedOrganizationIds: string[];
	user: { email: string; id: string; name: string };
	webhookUrl: string;
}

const notifyCalls: NotifyCall[] = [];
const notifyAccountDeletion = mock(
	async (
		webhookUrl: string,
		user: { id: string; name: string; email: string },
		deletedOrganizationIds: string[],
	) => {
		executionEvents.push("slack");
		notifyCalls.push({ webhookUrl, user, deletedOrganizationIds });
	},
);

const {
	validateProfileImage,
	deleteUserPostgresData,
	deleteUserWithAccountDeletionNotification,
} = await import("../handlers/profile.js");

const OWN_AVATAR_PATH = "/api/avatar/12345678-1234-1234-1234-123456789abc";

describe("validateProfileImage", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		executionEvents.length = 0;
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

describe("deleteUserPostgresData", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		executionEvents.length = 0;
		notifyCalls.length = 0;
		notifyAccountDeletion.mockClear();
		deleteUserSessions.mockClear();
		deleteUserSessionsCalls.length = 0;
		deleteUserSessionsImpl = async () => {
			executionEvents.push("clickhouse");
		};
		selectRows = [];
	});

	test("issues sole-member orgs query, deletes apikey, orgs, and user in order", async () => {
		selectRows = [
			{ organizationId: "org-personal-user-1" },
			{ organizationId: "org-other-sole" },
		];

		const result = await deleteUserPostgresData("user-1");

		expect(sqlQueries).toHaveLength(4);

		expect(sqlQueries[0]?.sql).toContain("SELECT organization_id");
		expect(sqlQueries[0]?.sql).toContain("HAVING COUNT(*) = 1");
		expect(sqlQueries[0]?.values).toEqual(["user-1"]);

		expect(sqlQueries[1]?.sql).toBe(
			"DELETE FROM apikey WHERE reference_id = ?",
		);
		expect(sqlQueries[1]?.values).toEqual(["user-1"]);

		expect(sqlQueries[2]?.sql).toBe(
			"DELETE FROM organization WHERE id = ANY(?::text[])",
		);
		expect(sqlQueries[2]?.values).toEqual([
			["org-personal-user-1", "org-other-sole"],
		]);

		expect(sqlQueries[3]?.sql).toBe('DELETE FROM "user" WHERE id = ?');
		expect(sqlQueries[3]?.values).toEqual(["user-1"]);

		expect(result).toEqual({
			deletedOrganizationIds: ["org-personal-user-1", "org-other-sole"],
		});
	});

	test("skips organization delete when user has no sole-member orgs", async () => {
		selectRows = [];

		const result = await deleteUserPostgresData("user-2");

		expect(sqlQueries).toHaveLength(3);
		expect(sqlQueries[1]?.sql).toBe(
			"DELETE FROM apikey WHERE reference_id = ?",
		);
		expect(sqlQueries[2]?.sql).toBe('DELETE FROM "user" WHERE id = ?');
		expect(sqlQueries[2]?.values).toEqual(["user-2"]);
		expect(result).toEqual({ deletedOrganizationIds: [] });
	});

	test("cleans ClickHouse before Slack, both before Postgres deletes", async () => {
		selectRows = [{ organizationId: "org-before-delete" }];

		const result = await deleteUserWithAccountDeletionNotification({
			deleteSessions: deleteUserSessions,
			notify: notifyAccountDeletion,
			slackWebhookUrl: "https://hooks.slack.com/services/test",
			user: {
				id: "user-before-delete",
				name: "Before Delete",
				email: "before-delete@example.com",
			},
		});

		expect(deleteUserSessionsCalls).toEqual(["user-before-delete"]);
		expect(notifyCalls).toEqual([
			{
				webhookUrl: "https://hooks.slack.com/services/test",
				user: {
					id: "user-before-delete",
					name: "Before Delete",
					email: "before-delete@example.com",
				},
				deletedOrganizationIds: ["org-before-delete"],
			},
		]);

		const clickhouseIndex = executionEvents.indexOf("clickhouse");
		const slackIndex = executionEvents.indexOf("slack");
		const firstDeleteIndex = executionEvents.findIndex((event) =>
			event.startsWith("DELETE"),
		);
		expect(clickhouseIndex).toBeGreaterThan(-1);
		expect(slackIndex).toBeGreaterThan(clickhouseIndex);
		expect(firstDeleteIndex).toBeGreaterThan(slackIndex);

		expect(sqlQueries).toHaveLength(4);
		expect(sqlQueries[0]?.sql).toContain("SELECT organization_id");
		expect(sqlQueries[1]?.sql).toBe(
			"DELETE FROM apikey WHERE reference_id = ?",
		);
		expect(sqlQueries[2]?.sql).toBe(
			"DELETE FROM organization WHERE id = ANY(?::text[])",
		);
		expect(sqlQueries[3]?.sql).toBe('DELETE FROM "user" WHERE id = ?');
		expect(result).toEqual({
			deletedOrganizationIds: ["org-before-delete"],
		});
	});

	test("aborts before Slack or Postgres when ClickHouse cleanup fails", async () => {
		selectRows = [{ organizationId: "org-failing" }];
		deleteUserSessionsImpl = async () => {
			executionEvents.push("clickhouse");
			throw new Error("clickhouse down");
		};

		await expect(
			deleteUserWithAccountDeletionNotification({
				deleteSessions: deleteUserSessions,
				notify: notifyAccountDeletion,
				slackWebhookUrl: "https://hooks.slack.com/services/test",
				user: {
					id: "user-failing",
					name: "Failing",
					email: "failing@example.com",
				},
			}),
		).rejects.toThrow("clickhouse down");

		expect(notifyCalls).toHaveLength(0);
		const deleteCount = sqlQueries.filter((q) =>
			q.sql.startsWith("DELETE"),
		).length;
		expect(deleteCount).toBe(0);
	});
});
