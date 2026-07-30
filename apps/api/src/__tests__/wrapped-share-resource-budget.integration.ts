import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	getWrappedShareSnapshotByteLength,
	WRAPPED_SHARE_RESOURCE_LIMITS,
	WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH,
	type WrappedShareSnapshot,
} from "@rudel/api-routes";
import postgres from "postgres";
import { sqlClient } from "../db.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!CONNECTION_STRING) {
	throw new Error("PG_CONNECTION_STRING environment variable is required");
}

const TEST_RUN_ID = `wrapped_resource_${Date.now()}_${randomUUID()}`;
const TEST_EMAIL = `${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = "wrapped-resource-budget-test-password";
const LOOKUP_REQUEST_COUNT = 1_000;
const LOOKUP_CONCURRENCY = 25;
const MAXIMUM_RSS_GROWTH_BYTES = 128 * 1024 * 1024;
const MAXIMUM_LOOKUP_P95_MS = 1_500;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const migrationSchemas: string[] = [];
const exactSnapshot = createExactSnapshotByteLimit();
const exactImageBytes = createPngBytes(
	WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
);
const exactImageDataUrl = createPngDataUrl(exactImageBytes);

let api: ApiTestServer;
let authToken: string;
let shareId: string;
let userId: string;

setDefaultTimeout(120_000);

beforeAll(async () => {
	api = await startApiTestServer({
		RATE_LIMIT_WRAPPED_SHARE_LOOKUP_CAPACITY: "2500",
		RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX: "1500",
		RATE_LIMIT_WRAPPED_SHARE_LOOKUP_SOURCE_MAX: "1500",
		STATIC_DIR: "../../apps/web",
	});

	const signupResponse = await fetch(`${api.baseUrl}/api/auth/sign-up/email`, {
		body: JSON.stringify({
			email: TEST_EMAIL,
			name: "Wrapped Resource Budget",
			password: TEST_PASSWORD,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	expect(signupResponse.ok).toBe(true);
	const signupBody: unknown = await signupResponse.json();
	assert(isAuthResponse(signupBody));
	authToken = signupBody.token;

	const meResponse = await callRpc(api.baseUrl, "me", undefined, authToken);
	expect(meResponse.status).toBe(200);
	userId = readRpcStringProperty(meResponse.body, "id");

	expect(getWrappedShareSnapshotByteLength(exactSnapshot)).toBe(
		WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
	);
	const createResponse = await callRpc(
		api.baseUrl,
		"wrappedShare/create",
		{
			snapshot: exactSnapshot,
			socialImageDataUrl: exactImageDataUrl,
			variant: "normal",
		},
		authToken,
	);
	expect(createResponse.status).toBe(200);
	shareId = readRpcStringProperty(createResponse.body, "id");
});

afterAll(async () => {
	await api?.stop();

	for (const schemaName of migrationSchemas) {
		await sqlClient.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
	}

	if (userId) {
		await sqlClient`DELETE FROM organization WHERE id = ${userId}`;
		await sqlClient`DELETE FROM "user" WHERE id = ${userId}`;
	}
});

describe("wrapped share PostgreSQL migration", () => {
	test("extracts only bounded images and leaves malformed legacy JSON deployable", async () => {
		const schemaName = `wrapped_migration_${randomUUID().replaceAll("-", "")}`;
		migrationSchemas.push(schemaName);
		const migrationClient = postgres(CONNECTION_STRING, {
			max: 1,
			prepare: false,
		});
		const migrationPath = resolve(
			import.meta.dir,
			"../../../../packages/sql-schema/db/migrations/0019_wrapped_share_social_image.sql",
		);
		const migrationSql = await readFile(migrationPath, "utf8");
		const fiveMiBImage = createPngDataUrl(createPngBytes(5 * 1024 * 1024));
		const oneByteOverImage = createPngDataUrl(
			createPngBytes(WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes + 1),
		);
		const oversizedLegacySnapshot = createLegacySnapshotAtByteLength(
			fiveMiBImage,
			7.25 * 1024 * 1024,
		);
		const exactImageSnapshot = JSON.stringify({
			marker: "exact",
			socialImageDataUrl: exactImageDataUrl,
		});
		const overImageSnapshot = JSON.stringify({
			marker: "over",
			socialImageDataUrl: oneByteOverImage,
		});

		await migrationClient.unsafe(`CREATE SCHEMA "${schemaName}"`);
		await migrationClient.unsafe(
			`CREATE TABLE "${schemaName}".wrapped_share (id text PRIMARY KEY, snapshot_json text NOT NULL)`,
		);
		await migrationClient.unsafe(
			`
				INSERT INTO "${schemaName}".wrapped_share (id, snapshot_json)
				VALUES
					($1, $2),
					($3, $4),
					($5, $6),
					($7, $8),
					($9, $10)
			`,
			[
				"legacy-oversized",
				oversizedLegacySnapshot,
				"exact-image",
				exactImageSnapshot,
				"over-image",
				overImageSnapshot,
				"malformed",
				"{not-json",
				"no-image",
				JSON.stringify({ marker: "no-image" }),
			],
		);
		await migrationClient.unsafe(`SET search_path TO "${schemaName}"`);
		await migrationClient.unsafe(migrationSql);

		const rows = await migrationClient.unsafe<
			Array<{
				id: string;
				snapshot_json: string;
				social_image_data_url: string | null;
			}>
		>(
			`
				SELECT id, snapshot_json, social_image_data_url
				FROM "${schemaName}".wrapped_share
				ORDER BY id
			`,
		);
		await migrationClient.end();

		const exactImageRow = rows.find((row) => row.id === "exact-image");
		const legacyOversizedRow = rows.find(
			(row) => row.id === "legacy-oversized",
		);
		const malformedRow = rows.find((row) => row.id === "malformed");
		const noImageRow = rows.find((row) => row.id === "no-image");
		const overImageRow = rows.find((row) => row.id === "over-image");
		assert(exactImageRow);
		assert(legacyOversizedRow);
		assert(malformedRow);
		assert(noImageRow);
		assert(overImageRow);

		expect(Buffer.byteLength(oversizedLegacySnapshot)).toBe(7.25 * 1024 * 1024);
		expect(exactImageRow.social_image_data_url).toBe(exactImageDataUrl);
		expect(exactImageRow.snapshot_json).not.toContain("socialImageDataUrl");
		expect(legacyOversizedRow.social_image_data_url).toBeNull();
		expect(legacyOversizedRow.snapshot_json).not.toContain(
			"socialImageDataUrl",
		);
		expect(overImageRow.social_image_data_url).toBeNull();
		expect(overImageRow.snapshot_json).not.toContain("socialImageDataUrl");
		expect(malformedRow).toEqual({
			id: "malformed",
			snapshot_json: "{not-json",
			social_image_data_url: null,
		});
		expect(noImageRow.snapshot_json).toBe(
			JSON.stringify({ marker: "no-image" }),
		);
		expect(noImageRow.social_image_data_url).toBeNull();
	});
});

describe("wrapped share real API resource budget", () => {
	test("accepts exact limits and rejects one byte over before changing the row", async () => {
		const [storedShare] = await sqlClient<
			Array<{
				imageBytes: number;
				snapshotBytes: number;
				snapshotJson: string;
			}>
		>`
			SELECT
				octet_length(social_image_data_url) AS "imageBytes",
				octet_length(snapshot_json) AS "snapshotBytes",
				snapshot_json AS "snapshotJson"
			FROM wrapped_share
			WHERE id = ${shareId}
		`;
		assert(storedShare);
		expect(storedShare.snapshotBytes).toBe(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		);
		expect(storedShare.imageBytes).toBe(
			WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH,
		);
		expect(storedShare.snapshotJson).not.toContain("socialImageDataUrl");

		const overSnapshot = createOneByteOverSnapshot(exactSnapshot);
		expect(getWrappedShareSnapshotByteLength(overSnapshot)).toBe(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes + 1,
		);
		const overSnapshotResponse = await callRpc(
			api.baseUrl,
			"wrappedShare/create",
			{
				snapshot: overSnapshot,
				socialImageDataUrl: exactImageDataUrl,
				variant: "normal",
			},
			authToken,
		);
		expect(overSnapshotResponse.status).toBe(400);

		const overImageDataUrl = createPngDataUrl(
			Buffer.concat([exactImageBytes, Buffer.of(0)]),
		);
		const overImageResponse = await callRpc(
			api.baseUrl,
			"wrappedShare/create",
			{
				snapshot: exactSnapshot,
				socialImageDataUrl: overImageDataUrl,
				variant: "normal",
			},
			authToken,
		);
		expect(overImageResponse.status).toBe(400);

		const fiveMiBImage = createPngDataUrl(createPngBytes(5 * 1024 * 1024));
		const legacySnapshot = JSON.parse(
			createLegacySnapshotAtByteLength(fiveMiBImage, 7.25 * 1024 * 1024),
		);
		const legacySnapshotResponse = await callRpc(
			api.baseUrl,
			"wrappedShare/create",
			{
				snapshot: legacySnapshot,
				variant: "normal",
			},
			authToken,
		);
		expect(legacySnapshotResponse.status).toBe(400);

		const [unchangedShare] = await sqlClient<
			Array<{ imageBytes: number; snapshotBytes: number }>
		>`
			SELECT
				octet_length(social_image_data_url) AS "imageBytes",
				octet_length(snapshot_json) AS "snapshotBytes"
			FROM wrapped_share
			WHERE id = ${shareId}
		`;
		expect(unchangedShare).toEqual({
			imageBytes: WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH,
			snapshotBytes: WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		});
	});

	test("keeps the image out of ordinary RPC and page responses", async () => {
		const rpcResponse = await callRpc(api.baseUrl, "wrappedShare/getPublic", {
			shareId,
		});
		expect(rpcResponse.status).toBe(200);
		expect(rpcResponse.bodyText).not.toContain("socialImageDataUrl");
		expect(rpcResponse.bodyText).not.toContain("data:image/png;base64,");
		expect(Buffer.byteLength(rpcResponse.bodyText)).toBeLessThanOrEqual(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes + 2_048,
		);

		const pageResponse = await fetch(`${api.baseUrl}/wrapped/${shareId}`);
		const pageHtml = await pageResponse.text();
		expect(pageResponse.status).toBe(200);
		expect(pageHtml).not.toContain("data:image/png;base64,");
		expect(pageHtml).toContain(`/wrapped/${shareId}/x-card.png`);

		const imageResponse = await fetch(
			`${api.baseUrl}/wrapped/${shareId}/x-card.png`,
		);
		const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
		expect(imageResponse.status).toBe(200);
		expect(imageBytes.byteLength).toBe(
			WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
		);
		expect(hashBytes(imageBytes)).toBe(hashBytes(exactImageBytes));
	});

	test("does not touch social-image TOAST blocks on ordinary database projections", async () => {
		const toastRelationBytes = await readWrappedShareToastRelationBytes();
		expect(toastRelationBytes).toBeGreaterThan(
			WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
		);

		const beforeOrdinaryReads = await readWrappedShareToastBlocks();
		const ordinaryClient = postgres(CONNECTION_STRING, {
			max: 1,
			prepare: false,
		});
		await ordinaryClient`
			SELECT snapshot_json
			FROM wrapped_share
			WHERE id = ${shareId}
				AND octet_length(snapshot_json) <= ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes}
		`;
		await ordinaryClient`
			SELECT social_image_data_url IS NOT NULL AS "hasSocialImage"
			FROM wrapped_share
			WHERE id = ${shareId}
				AND octet_length(snapshot_json) <= ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes}
		`;
		await ordinaryClient.end();
		const afterOrdinaryReads = await readWrappedShareToastBlocks();
		expect(afterOrdinaryReads).toBe(beforeOrdinaryReads);

		const imageClient = postgres(CONNECTION_STRING, {
			max: 1,
			prepare: false,
		});
		await imageClient`
			SELECT
				CASE
					WHEN octet_length(social_image_data_url) <= ${WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH}
						THEN social_image_data_url
					ELSE NULL
				END AS "socialImageDataUrl"
			FROM wrapped_share
			WHERE id = ${shareId}
		`;
		await imageClient.end();
		const afterImageRead = await readWrappedShareToastBlocks();
		expect(afterImageRead).toBeGreaterThan(afterOrdinaryReads);
	});

	test("keeps p95 latency, response bytes, and API memory bounded under load", async () => {
		for (let request = 0; request < LOOKUP_CONCURRENCY; request += 1) {
			const warmup = await callPublicShare(api.baseUrl, shareId);
			expect(warmup.status).toBe(200);
		}

		const rssBefore = readProcessRssBytes(api.pid);
		const results: PublicLookupResult[] = [];

		for (
			let offset = 0;
			offset < LOOKUP_REQUEST_COUNT;
			offset += LOOKUP_CONCURRENCY
		) {
			const batchSize = Math.min(
				LOOKUP_CONCURRENCY,
				LOOKUP_REQUEST_COUNT - offset,
			);
			const batch = await Promise.all(
				Array.from({ length: batchSize }, () =>
					callPublicShare(api.baseUrl, shareId),
				),
			);
			results.push(...batch);
		}

		const rssAfter = readProcessRssBytes(api.pid);
		const sortedDurations = results
			.map((result) => result.durationMs)
			.sort((left, right) => left - right);
		const p95Index = Math.ceil(sortedDurations.length * 0.95) - 1;
		const p95Duration = sortedDurations[p95Index];
		assert(p95Duration !== undefined);

		expect(results).toHaveLength(LOOKUP_REQUEST_COUNT);
		expect(results.every((result) => result.status === 200)).toBe(true);
		expect(
			results.every(
				(result) =>
					result.responseBytes <=
					WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes + 2_048,
			),
		).toBe(true);
		expect(p95Duration).toBeLessThan(MAXIMUM_LOOKUP_P95_MS);
		expect(rssAfter - rssBefore).toBeLessThan(MAXIMUM_RSS_GROWTH_BYTES);
	});
});

interface RpcCallResult {
	body: unknown;
	bodyText: string;
	status: number;
}

interface PublicLookupResult {
	durationMs: number;
	responseBytes: number;
	status: number;
}

async function callRpc(
	baseUrl: string,
	path: string,
	input: Record<string, unknown> | undefined,
	token?: string,
): Promise<RpcCallResult> {
	const response = await fetch(`${baseUrl}/rpc/${path}`, {
		body: JSON.stringify(input ? { json: input } : {}),
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			"Content-Type": "application/json",
		},
		method: "POST",
	});
	const bodyText = await response.text();

	return {
		body: JSON.parse(bodyText),
		bodyText,
		status: response.status,
	};
}

async function callPublicShare(
	baseUrl: string,
	publicShareId: string,
): Promise<PublicLookupResult> {
	const startedAt = performance.now();
	const response = await fetch(`${baseUrl}/rpc/wrappedShare/getPublic`, {
		body: JSON.stringify({ json: { shareId: publicShareId } }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const responseBytes = (await response.arrayBuffer()).byteLength;

	return {
		durationMs: performance.now() - startedAt,
		responseBytes,
		status: response.status,
	};
}

function createExactSnapshotByteLimit(): WrappedShareSnapshot {
	const text = "界".repeat(250);
	const maximumText = `${text}${"界".repeat(6)}`;
	const backMetrics = Array.from({ length: 20 }, (_, index) => ({
		label: index * 2 < 17 ? maximumText : text,
		value: index * 2 + 1 < 17 ? maximumText : text,
	}));

	return {
		archetypeLabel: maximumText,
		backMetrics,
		headerLeftMetric: { label: text, title: text, value: text },
		headerRightMetric: { label: text, title: text, value: text },
		row: {
			activeDays: 6,
			cost: 42,
			displayName: text,
			favoriteModel: text,
			hasActivity: true,
			imageUrl: "界".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength),
			inputTokens: 120,
			lastActiveDate: text,
			outputTokens: 240,
			role: text,
			totalSessions: 12,
			totalTokens: 360,
		},
		shellClassName: "界".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength),
		statItems: Array.from(
			{ length: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount },
			(_, index) => ({
				key: `stat-${index}`,
				label: text,
				title: text,
				value: text,
			}),
		),
		theme: "light",
	};
}

function createOneByteOverSnapshot(
	snapshot: WrappedShareSnapshot,
): WrappedShareSnapshot {
	return {
		...snapshot,
		row: {
			...snapshot.row,
			displayName: `${snapshot.row.displayName}x`,
		},
	};
}

function createPngBytes(byteLength: number) {
	const bytes = randomBytes(byteLength);
	bytes.set(PNG_SIGNATURE);
	return bytes;
}

function createPngDataUrl(bytes: Uint8Array) {
	return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function createLegacySnapshotAtByteLength(
	socialImageDataUrl: string,
	targetBytes: number,
) {
	const snapshot = {
		marker: "legacy-oversized",
		padding: "",
		socialImageDataUrl,
	};
	const emptyPaddingJson = JSON.stringify(snapshot);
	const paddingBytes = targetBytes - Buffer.byteLength(emptyPaddingJson);
	if (paddingBytes < 0) {
		throw new Error("Legacy fixture target is smaller than its social image");
	}

	return JSON.stringify({
		...snapshot,
		padding: "x".repeat(paddingBytes),
	});
}

async function readWrappedShareToastRelationBytes() {
	const [row] = await sqlClient<Array<{ bytes: string | number }>>`
		SELECT pg_total_relation_size(reltoastrelid) AS bytes
		FROM pg_class
		WHERE oid = to_regclass('public.wrapped_share')
	`;
	assert(row);
	return Number(row.bytes);
}

async function readWrappedShareToastBlocks() {
	const [row] = await sqlClient<Array<{ blocks: string | number }>>`
		SELECT
			COALESCE(toast_blks_read, 0) + COALESCE(toast_blks_hit, 0) AS blocks
		FROM pg_statio_user_tables
		WHERE schemaname = 'public'
			AND relname = 'wrapped_share'
	`;
	assert(row);
	return Number(row.blocks);
}

function readProcessRssBytes(pid: number) {
	const result = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(pid)]);
	expect(result.exitCode).toBe(0);
	const rssKiB = Number(new TextDecoder().decode(result.stdout).trim());
	expect(Number.isFinite(rssKiB)).toBe(true);
	return rssKiB * 1024;
}

function hashBytes(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function isAuthResponse(value: unknown): value is { token: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"token" in value &&
		typeof value.token === "string"
	);
}

function readRpcStringProperty(body: unknown, property: string) {
	if (
		typeof body !== "object" ||
		body === null ||
		!("json" in body) ||
		typeof body.json !== "object" ||
		body.json === null
	) {
		throw new Error(`RPC response is missing string property: ${property}`);
	}

	const value = Reflect.get(body.json, property);

	if (typeof value !== "string") {
		throw new Error(`RPC response is missing string property: ${property}`);
	}

	return value;
}
