import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session as AuthSession } from "../auth.js";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const sqlQueries: SqlQuery[] = [];
let selectRows: unknown[] = [];
let insertRows: unknown[] = [];
let txSelectRows: unknown[] = [];
let txInsertRows: unknown[] = [];
let txQueries: SqlQuery[] = [];

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	sqlQueries.push({ sql, values });
	if (sql.startsWith("SELECT")) return selectRows;
	if (sql.startsWith("INSERT")) return insertRows;
	throw new Error(`Unexpected SQL query: ${sql}`);
}
sqlClient.begin = async <T>(fn: (tx: typeof sqlClient) => Promise<T>) => {
	function tx(strings: TemplateStringsArray, ...values: unknown[]) {
		const sql = strings.join("?").replace(/\s+/gu, " ").trim();
		txQueries.push({ sql, values });
		if (sql.startsWith("SELECT")) return txSelectRows;
		if (sql.startsWith("INSERT")) return txInsertRows;
		if (sql.startsWith("UPDATE")) return [];
		if (sql.startsWith("DELETE")) return [];
		throw new Error(`Unexpected tx SQL: ${sql}`);
	}
	return fn(tx as unknown as typeof sqlClient);
};

mock.module("../db.js", () => ({
	sqlClient,
}));

const { handleAvatarGetRequest, handleAvatarUploadRequest } = await import(
	"../handlers/avatar-http.js"
);

const VALID_PUBLIC_ID = "12345678-1234-1234-1234-123456789abc";
const REAL_PNG_BYTES = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52,
]);

const session: AuthSession = {
	user: {
		id: "user-1",
		email: "ada@example.com",
		emailVerified: true,
		name: "Ada Lovelace",
		image: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	},
	session: {
		id: "session-1",
		token: "token-1",
		userId: "user-1",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		expiresAt: new Date("2026-12-31T00:00:00.000Z"),
	},
} as unknown as AuthSession;

describe("avatar GET handler", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		insertRows = [];
		txQueries = [];
	});

	test("rejects malformed public ids without a DB lookup", async () => {
		const response = await handleAvatarGetRequest({
			cors: {},
			ifNoneMatch: null,
			method: "GET",
			pathname: "/api/avatar/not-a-uuid",
		});
		expect(response.status).toBe(404);
		expect(sqlQueries).toHaveLength(0);
	});

	test("returns 404 when the avatar does not exist", async () => {
		selectRows = [];
		const response = await handleAvatarGetRequest({
			cors: {},
			ifNoneMatch: null,
			method: "GET",
			pathname: `/api/avatar/${VALID_PUBLIC_ID}`,
		});
		expect(response.status).toBe(404);
		expect(sqlQueries).toHaveLength(1);
	});

	test("serves bytes with cache-control + ETag + Content-Length", async () => {
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		selectRows = [
			{
				byte_length: bytes.byteLength,
				content_type: "image/png",
				image_data: new Uint8Array(bytes),
				image_hash: "abc123",
			},
		];

		const response = await handleAvatarGetRequest({
			cors: {},
			ifNoneMatch: null,
			method: "GET",
			pathname: `/api/avatar/${VALID_PUBLIC_ID}`,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("Content-Length")).toBe("4");
		expect(response.headers.get("ETag")).toBe('"abc123"');
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
		const responseBytes = Buffer.from(await response.arrayBuffer());
		expect(Buffer.compare(responseBytes, bytes)).toBe(0);
	});

	test("returns 304 when If-None-Match matches the current ETag", async () => {
		selectRows = [
			{
				byte_length: 4,
				content_type: "image/png",
				image_data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
				image_hash: "matching",
			},
		];
		const response = await handleAvatarGetRequest({
			cors: {},
			ifNoneMatch: '"matching"',
			method: "GET",
			pathname: `/api/avatar/${VALID_PUBLIC_ID}`,
		});
		expect(response.status).toBe(304);
		expect(await response.text()).toBe("");
	});

	test("HEAD returns headers without body", async () => {
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		selectRows = [
			{
				byte_length: bytes.byteLength,
				content_type: "image/png",
				image_data: new Uint8Array(bytes),
				image_hash: "abc",
			},
		];
		const response = await handleAvatarGetRequest({
			cors: {},
			ifNoneMatch: null,
			method: "HEAD",
			pathname: `/api/avatar/${VALID_PUBLIC_ID}`,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("ETag")).toBe('"abc"');
		expect(await response.text()).toBe("");
	});
});

interface MultipartFile {
	field: string;
	filename: string;
	contentType: string;
	bytes: Buffer;
}

// Bun's Request<->FormData round-trip is lossy: it advertises a boundary in
// Content-Type but the encoded bytes don't include matching boundaries when
// extracted via arrayBuffer(). So we encode multipart by hand here so the
// handler under test sees a parseable body with a known Content-Length.
function buildMultipartRequest(input: {
	files?: readonly MultipartFile[];
	fields?: Readonly<Record<string, string>>;
}): Request {
	const boundary = "----test-boundary-rudel";
	const parts: Buffer[] = [];

	for (const [name, value] of Object.entries(input.fields ?? {})) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
			),
		);
	}

	for (const file of input.files ?? []) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
			),
		);
		parts.push(file.bytes);
		parts.push(Buffer.from("\r\n"));
	}

	parts.push(Buffer.from(`--${boundary}--\r\n`));

	const body = Buffer.concat(parts);
	return new Request("http://localhost/api/profile/avatar", {
		method: "POST",
		body,
		headers: {
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
			"Content-Length": body.byteLength.toString(),
		},
	});
}

describe("avatar upload handler", () => {
	beforeEach(() => {
		sqlQueries.length = 0;
		selectRows = [];
		insertRows = [];
		txQueries = [];
		txSelectRows = [];
		txInsertRows = [];
	});

	test("rejects unauthenticated callers with 401 and no DB writes", async () => {
		const request = buildMultipartRequest({
			files: [
				{
					field: "file",
					filename: "avatar.png",
					contentType: "image/png",
					bytes: REAL_PNG_BYTES,
				},
			],
		});

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => null,
			request,
		});

		expect(response.status).toBe(401);
		expect(sqlQueries).toHaveLength(0);
		expect(txQueries).toHaveLength(0);
	});

	test("rejects requests without Content-Length with 411", async () => {
		const request = new Request("http://localhost/api/profile/avatar", {
			method: "POST",
			body: "noop",
		});
		// jsdom-style fetch attaches Content-Length automatically; strip it.
		const headersWithoutLength = new Headers(request.headers);
		headersWithoutLength.delete("Content-Length");
		const stripped = new Request(request, { headers: headersWithoutLength });

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => session,
			request: stripped,
		});

		expect(response.status).toBe(411);
		expect(txQueries).toHaveLength(0);
	});

	test("rejects oversize multipart envelopes with 413 before parsing", async () => {
		const headers = new Headers({ "Content-Length": String(10 * 1024 * 1024) });
		const request = new Request("http://localhost/api/profile/avatar", {
			method: "POST",
			headers,
			body: "ignored",
		});

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => session,
			request,
		});

		expect(response.status).toBe(413);
		expect(txQueries).toHaveLength(0);
	});

	test("rejects multipart bodies missing the file field with 400", async () => {
		const request = buildMultipartRequest({
			fields: { "not-the-file": "value" },
		});

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => session,
			request,
		});

		expect(response.status).toBe(400);
	});

	test("rejects spoofed PNG content (script body) with 415", async () => {
		const request = buildMultipartRequest({
			files: [
				{
					field: "file",
					filename: "avatar.png",
					contentType: "image/png",
					bytes: Buffer.from("<script>alert(1)</script>"),
				},
			],
		});

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => session,
			request,
		});

		expect(response.status).toBe(415);
		expect(txQueries).toHaveLength(0);
	});

	test("persists a real PNG and returns the freshly assigned avatar URL", async () => {
		txInsertRows = [{ public_id: VALID_PUBLIC_ID }];
		selectRows = [
			{
				email: "ada@example.com",
				id: "user-1",
				image: `/api/avatar/${VALID_PUBLIC_ID}`,
				name: "Ada Lovelace",
			},
		];

		const request = buildMultipartRequest({
			files: [
				{
					field: "file",
					filename: "avatar.png",
					contentType: "image/png",
					bytes: REAL_PNG_BYTES,
				},
			],
		});

		const response = await handleAvatarUploadRequest({
			cors: {},
			getSession: async () => session,
			request,
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { user: { image: string | null } };
		expect(body.user.image).toBe(`/api/avatar/${VALID_PUBLIC_ID}`);
		expect(response.headers.get("X-Avatar-Public-Id")).toBe(VALID_PUBLIC_ID);
		// Insert + UPDATE inside the transaction.
		expect(txQueries[0]?.sql.startsWith("INSERT INTO user_avatar")).toBe(true);
		expect(txQueries[1]?.sql.startsWith('UPDATE "user"')).toBe(true);
		// Final SELECT to compose the response.
		expect(sqlQueries[0]?.sql.startsWith("SELECT id, email, name, image")).toBe(
			true,
		);
	});
});
