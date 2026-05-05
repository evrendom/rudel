#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import {
	WRAPPED_ARCHETYPE_CENTROID_VERSION,
	WRAPPED_ARCHETYPE_PIPELINE_VERSION,
} from "../src/wrapped-archetype-constants.ts";
import {
	buildWrappedArchetypeRunInsertSql,
	buildWrappedArchetypeSnapshotInsertSql,
} from "../src/wrapped-archetype-rebuild.ts";

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.trim() === "") {
		throw new Error(`${name} is required`);
	}
	return value;
}

function buildClickhouseUrl(base: string, params: Record<string, string>) {
	const url = new URL(base);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

async function runClickhouseStatement(
	url: string,
	username: string,
	password: string,
	database: string,
	query: string,
): Promise<string> {
	const fullUrl = buildClickhouseUrl(url, {
		database,
		default_format: "JSONCompact",
	});
	const response = await fetch(fullUrl, {
		method: "POST",
		headers: {
			"X-ClickHouse-User": username,
			"X-ClickHouse-Key": password,
			"Content-Type": "text/plain",
		},
		body: query,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`ClickHouse statement failed (${response.status}): ${text}\nQuery: ${query.slice(0, 500)}`,
		);
	}
	return text;
}

async function main() {
	const url = getEnv("CLICKHOUSE_URL");
	const username = process.env.CLICKHOUSE_USERNAME ?? "default";
	const password = process.env.CLICKHOUSE_PASSWORD ?? "";
	const database = process.env.CLICKHOUSE_DB ?? "rudel";
	const snapshotId = randomUUID();
	const snapshotCreatedAt = new Date()
		.toISOString()
		.replace("T", " ")
		.replace("Z", "");

	console.log(
		`[rebuild] starting; snapshot_id=${snapshotId} pipeline_version=${WRAPPED_ARCHETYPE_PIPELINE_VERSION} centroid_version=${WRAPPED_ARCHETYPE_CENTROID_VERSION}`,
	);

	const snapshotSql = buildWrappedArchetypeSnapshotInsertSql({
		snapshotCreatedAt,
		snapshotId,
	});
	console.log(`[rebuild] inserting snapshot rows...`);
	await runClickhouseStatement(url, username, password, database, snapshotSql);
	console.log(`[rebuild] snapshot insert succeeded`);

	const runSql = buildWrappedArchetypeRunInsertSql({
		snapshotCreatedAt,
		snapshotId,
		triggerReason: "manual_rebuild",
		triggerSessionId: null,
		triggerSource: null,
	});
	console.log(`[rebuild] publishing run row...`);
	await runClickhouseStatement(url, username, password, database, runSql);
	console.log(`[rebuild] run row published; snapshot_id=${snapshotId}`);
}

main().catch((error) => {
	console.error("[rebuild] failed:", error);
	process.exit(1);
});
