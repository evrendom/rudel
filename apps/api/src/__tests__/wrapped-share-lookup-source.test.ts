import { describe, expect, test } from "bun:test";
import { resolveWrappedShareLookupSource } from "../lib/wrapped-share-lookup-source.js";

describe("resolveWrappedShareLookupSource", () => {
	test("uses the socket peer when no proxy is trusted", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: null,
				forwardedFor: "192.0.2.10",
				socketIp: "198.51.100.20",
				trustedProxyHops: 0,
			}),
		).toBe("198.51.100.20");
	});

	test("uses the client supplied by one trusted reverse proxy", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: null,
				forwardedFor: "192.0.2.10, 198.51.100.20",
				socketIp: "203.0.113.30",
				trustedProxyHops: 1,
			}),
		).toBe("198.51.100.20");
	});

	test("uses Fly-Client-IP for a direct Fly deployment", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: "198.51.100.20",
				forwardedFor: "192.0.2.10, 203.0.113.30",
				socketIp: "fdaa::1",
				trustedProxyHops: 0,
			}),
		).toBe("198.51.100.20");
	});

	test("uses the client before a trusted proxy in front of Fly", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: "198.51.100.20",
				forwardedFor: "192.0.2.10, 198.51.100.20, 203.0.113.30",
				socketIp: "fdaa::1",
				trustedProxyHops: 1,
			}),
		).toBe("192.0.2.10");
	});

	test("falls back to the peer when the configured chain is too short", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: null,
				forwardedFor: null,
				socketIp: "198.51.100.20",
				trustedProxyHops: 1,
			}),
		).toBe("198.51.100.20");
	});

	test("does not trust a forwarded address without a known peer", () => {
		expect(
			resolveWrappedShareLookupSource({
				flyClientIp: null,
				forwardedFor: "192.0.2.10",
				socketIp: null,
				trustedProxyHops: 1,
			}),
		).toBe("unknown");
	});
});
