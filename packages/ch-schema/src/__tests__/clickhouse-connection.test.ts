import { describe, expect, it } from "bun:test";
import {
	isLocalClickHouseEndpoint,
	resolveClickHouseUsername,
} from "../clickhouse-connection.js";

const LOCAL = "http://localhost:8123";
const REMOTE = "https://instance.obsessiondb.com";

describe("isLocalClickHouseEndpoint", () => {
	it("accepts loopback hosts and .localhost subdomains", () => {
		expect(isLocalClickHouseEndpoint(LOCAL)).toBe(true);
		expect(isLocalClickHouseEndpoint("http://127.0.0.1:8123")).toBe(true);
		expect(isLocalClickHouseEndpoint("http://[::1]:8123")).toBe(true);
		expect(isLocalClickHouseEndpoint("http://ch.localhost:8123")).toBe(true);
		expect(isLocalClickHouseEndpoint("http://host.docker.internal:8123")).toBe(
			true,
		);
	});

	it("treats remote, private-range, unset and malformed URLs as non-local", () => {
		expect(isLocalClickHouseEndpoint(REMOTE)).toBe(false);
		// A private address can be a production cluster; never assume local.
		expect(isLocalClickHouseEndpoint("http://10.0.0.5:8123")).toBe(false);
		expect(isLocalClickHouseEndpoint("http://192.168.1.20:8123")).toBe(false);
		expect(isLocalClickHouseEndpoint(undefined)).toBe(false);
		expect(isLocalClickHouseEndpoint("not-a-url")).toBe(false);
	});
});

describe("resolveClickHouseUsername", () => {
	it("prefers CLICKHOUSE_USERNAME over the legacy CLICKHOUSE_USER", () => {
		const username = resolveClickHouseUsername(
			{
				CLICKHOUSE_USERNAME: "rudel_migrator",
				CLICKHOUSE_USER: "rudel_migrator",
			},
			REMOTE,
		);
		expect(username).toBe("rudel_migrator");
	});

	it("accepts the legacy variable alone", () => {
		expect(
			resolveClickHouseUsername({ CLICKHOUSE_USER: "legacy_user" }, REMOTE),
		).toBe("legacy_user");
	});

	it("assumes default only for a local endpoint", () => {
		expect(resolveClickHouseUsername({}, LOCAL)).toBe("default");
	});

	it("refuses to assume default against a remote endpoint", () => {
		expect(() => resolveClickHouseUsername({}, REMOTE)).toThrow(
			/required for a non-local ClickHouse endpoint/,
		);
	});

	it("treats blank and whitespace-only values as missing", () => {
		expect(
			resolveClickHouseUsername(
				{ CLICKHOUSE_USERNAME: "", CLICKHOUSE_USER: "   " },
				LOCAL,
			),
		).toBe("default");
		expect(() =>
			resolveClickHouseUsername({ CLICKHOUSE_USERNAME: "   " }, REMOTE),
		).toThrow(/required for a non-local ClickHouse endpoint/);
	});

	it("trims surrounding whitespace off a real value", () => {
		expect(
			resolveClickHouseUsername(
				{ CLICKHOUSE_USERNAME: "  app_reader  " },
				REMOTE,
			),
		).toBe("app_reader");
	});

	it("rejects conflicting canonical and legacy values", () => {
		expect(() =>
			resolveClickHouseUsername(
				{ CLICKHOUSE_USERNAME: "migrator", CLICKHOUSE_USER: "default" },
				REMOTE,
			),
		).toThrow(/ambiguous/);
	});

	it("fails closed on a malformed URL rather than assuming local", () => {
		expect(() => resolveClickHouseUsername({}, "not-a-url")).toThrow(
			/required for a non-local ClickHouse endpoint/,
		);
	});
});
