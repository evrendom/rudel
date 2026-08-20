import { describe, expect, test } from "bun:test";
import { resolveAuthCookiePrefix } from "../auth-cookie-prefix.js";

describe("resolveAuthCookiePrefix", () => {
	test("isolates localhost cookies by frontend port", () => {
		expect(resolveAuthCookiePrefix("http://localhost:55001")).toBe(
			"rudel-local-55001",
		);
	});

	test("uses the same port namespace for 127.0.0.1", () => {
		expect(resolveAuthCookiePrefix("http://127.0.0.1:55001")).toBe(
			"rudel-local-55001",
		);
	});

	test("keeps Better Auth's existing cookie prefix outside local development", () => {
		expect(resolveAuthCookiePrefix("https://app.rudel.ai")).toBeUndefined();
	});

	test("fails closed to Better Auth's default for an invalid frontend URL", () => {
		expect(resolveAuthCookiePrefix("not-a-url")).toBeUndefined();
	});
});
