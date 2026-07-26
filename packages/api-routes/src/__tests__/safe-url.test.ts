import { describe, expect, test } from "bun:test";
import {
	isLoopbackHostname,
	parseSafeApiBase,
	parseSafeApiEndpoint,
	parseSafeBrowserUrl,
	type SafeUrlRejectionReason,
	type SafeUrlResult,
	sanitizeForTerminalDisplay,
} from "../safe-url.js";

const ESCAPE = String.fromCharCode(0x1b);
const BELL = String.fromCharCode(0x07);

/** Narrow an accepted result and return the reserialized URL. */
function acceptedUrl(result: SafeUrlResult): string {
	if (!result.ok) {
		throw new Error(`expected acceptance, got rejection: ${result.detail}`);
	}
	return result.url;
}

/** Narrow a rejected result and return its reason code. */
function rejectionReason(result: SafeUrlResult): SafeUrlRejectionReason {
	if (result.ok) {
		throw new Error(`expected rejection, got accepted URL: ${result.url}`);
	}
	return result.reason;
}

describe("parseSafeBrowserUrl: rejects unsafe input", () => {
	test.each([
		["javascript:alert(1)//", "disallowed_scheme"],
		["data:text/html,<script>1</script>", "disallowed_scheme"],
		["file:///etc/passwd", "disallowed_scheme"],
		// `open` on macOS treats this as a filesystem path and launches the app.
		["/Applications/Calculator.app", "malformed"],
		// `open` would parse a leading dash as its own flag.
		["-e", "malformed"],
		["", "malformed"],
		["not a url at all", "malformed"],
		["http://evil.example/device", "plaintext_non_loopback"],
		// Reads as app.rudel.ai but resolves to evil.example.
		["https://app.rudel.ai@evil.example/device", "embedded_credentials"],
		["https://user:pass@app.rudel.ai/device", "embedded_credentials"],
	] as const)("rejects %p as %p", (input, expected) => {
		expect(
			rejectionReason(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toBe(expected);
	});
});

describe("parseSafeBrowserUrl: accepts legitimate input", () => {
	test("accepts the production verification URL unchanged", () => {
		const input = "https://app.rudel.ai/device?user_code=ABCD1234";
		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toBe(input);
	});

	test.each([
		"http://localhost/device?user_code=X",
		"http://localhost:4011/device?user_code=X",
		"http://127.0.0.1:4011/device?user_code=X",
		"http://[::1]:4010/device?user_code=X",
	])("accepts loopback plaintext %p", (input) => {
		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toBe(input);
	});

	test("accepts a multi-parameter URL unchanged", () => {
		// Guards against a future `&` blocklist breaking valid URLs. A metacharacter
		// blocklist cannot reject `&`, because it is the query separator.
		const input = "https://app.rudel.ai/device?a=1&b=2&user_code=X";
		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toBe(input);
	});

	test("percent-encodes an ANSI escape instead of passing it through", () => {
		// The URL is printed to the terminal, so an unescaped ESC could repaint it.
		const input = `https://app.rudel.ai/device?user_code=${ESCAPE}]0;pwned${BELL}`;
		const accepted = acceptedUrl(
			parseSafeBrowserUrl(input, { allowPlaintext: false }),
		);

		expect(accepted).toContain("%1B");
		expect(accepted).not.toContain(ESCAPE);
		expect(accepted).not.toContain(BELL);
	});
});

describe("parseSafeBrowserUrl: documents what validation does NOT fix", () => {
	test("accepts a legitimate-origin URL carrying cmd.exe metacharacters", () => {
		// This is the core reason the Windows opener must not use a shell. `&` is a
		// legal URL character, survives WHATWG serialization, and passes both the
		// scheme allowlist and any origin check — while still injecting on cmd.exe.
		// If this test ever starts failing, the shell-free opener is what protects
		// Windows; do not "fix" it by blocklisting `&`.
		const input = "https://app.rudel.ai/device?user_code=ABCD1234&calc";
		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toBe(input);
	});

	test.each([
		"&",
		"|",
		"(",
		")",
		"!",
	])("preserves %p through reserialization", (character) => {
		const input = `https://app.rudel.ai/device?user_code=X${character}y`;
		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: false })),
		).toContain(character);
	});
});

describe("parseSafeBrowserUrl: plaintext opt-in", () => {
	test("accepts a plaintext non-loopback URL when the operator opted in", () => {
		// A self-hosted plaintext deployment serves its verification frontend over
		// http: too, so this must agree with the API-base decision or the opt-in is
		// useless — which it was, until this was fixed.
		const input = "http://rudel.internal/device?user_code=X";

		expect(
			acceptedUrl(parseSafeBrowserUrl(input, { allowPlaintext: true })),
		).toBe(input);
	});

	test("still refuses a non-http scheme when the operator opted in", () => {
		expect(
			rejectionReason(
				parseSafeBrowserUrl("javascript:alert(1)//", { allowPlaintext: true }),
			),
		).toBe("disallowed_scheme");
	});

	test("still refuses embedded credentials when the operator opted in", () => {
		expect(
			rejectionReason(
				parseSafeBrowserUrl("http://app.rudel.ai@evil.example/device", {
					allowPlaintext: true,
				}),
			),
		).toBe("embedded_credentials");
	});
});

describe("parseSafeApiBase", () => {
	test.each([
		"https://app.rudel.ai?tenant=acme",
		"https://app.rudel.ai/prefix?a=1",
		"https://app.rudel.ai#frag",
	])("rejects %p, which would corrupt the appended route", (input) => {
		// `${base}/api/auth/device/code` on `https://host/?a=1` yields
		// `https://host/?a=1/api/auth/device/code` — a silently wrong endpoint.
		expect(
			rejectionReason(parseSafeApiBase(input, { allowPlaintext: false })),
		).toBe("unexpected_query_or_fragment");
	});

	test("rejects plaintext non-loopback by default", () => {
		expect(
			rejectionReason(
				parseSafeApiBase("http://evil.example", { allowPlaintext: false }),
			),
		).toBe("plaintext_non_loopback");
	});

	test("allows plaintext non-loopback behind the explicit opt-in", () => {
		expect(
			acceptedUrl(
				parseSafeApiBase("http://internal.example", { allowPlaintext: true }),
			),
		).toBe("http://internal.example");
	});

	test.each([
		"http://localhost:4010",
		"http://127.0.0.1:4010",
		"https://rudel.internal",
		"https://app.rudel.ai",
	])("accepts %p without the opt-in", (input) => {
		expect(
			acceptedUrl(parseSafeApiBase(input, { allowPlaintext: false })),
		).toBe(input);
	});

	test.each([
		["https://app.rudel.ai/", "https://app.rudel.ai"],
		["https://app.rudel.ai///", "https://app.rudel.ai"],
		["https://app.rudel.ai/prefix/", "https://app.rudel.ai/prefix"],
	])("strips the trailing slash from %p", (input, expected) => {
		// So `${base}/api/auth/device/code` cannot produce a doubled slash.
		expect(
			acceptedUrl(parseSafeApiBase(input, { allowPlaintext: false })),
		).toBe(expected);
	});

	test("rejects a non-http scheme even with the opt-in", () => {
		expect(
			rejectionReason(
				parseSafeApiBase("file:///etc/passwd", { allowPlaintext: true }),
			),
		).toBe("disallowed_scheme");
	});

	test("rejects an api base carrying credentials", () => {
		expect(
			rejectionReason(
				parseSafeApiBase("https://user:pass@app.rudel.ai", {
					allowPlaintext: false,
				}),
			),
		).toBe("embedded_credentials");
	});
});

describe("parseSafeApiEndpoint", () => {
	const alwaysRejectedEndpoints: ReadonlyArray<
		readonly [string, SafeUrlRejectionReason]
	> = [
		["file:///etc/passwd", "disallowed_scheme"],
		["http://user:pass@evil.example/rpc", "embedded_credentials"],
	];

	test("refuses plaintext to a non-loopback host by default", () => {
		expect(
			rejectionReason(
				parseSafeApiEndpoint("http://evil.example/rpc", {
					allowPlaintext: false,
				}),
			),
		).toBe("plaintext_non_loopback");
	});

	test("allows plaintext to a non-loopback host behind the explicit opt-in", () => {
		const input = "http://evil.example/rpc";
		expect(
			acceptedUrl(
				parseSafeApiEndpoint(input, {
					allowPlaintext: true,
				}),
			),
		).toBe(input);
	});

	test("allows a plaintext loopback endpoint without an opt-in", () => {
		const input = "http://localhost:4010/rpc";
		expect(
			acceptedUrl(
				parseSafeApiEndpoint(input, {
					allowPlaintext: false,
				}),
			),
		).toBe(input);
	});

	test.each(
		alwaysRejectedEndpoints,
	)("refuses %p as %p even with the opt-in", (input, expected) => {
		expect(
			rejectionReason(
				parseSafeApiEndpoint(input, {
					allowPlaintext: true,
				}),
			),
		).toBe(expected);
	});

	test.each([
		"https://app.rudel.ai/rpc/",
		"https://app.rudel.ai/rpc?tenant=acme",
		"https://app.rudel.ai/rpc#fragment",
	])("preserves full endpoint semantics for %p", (input) => {
		expect(
			acceptedUrl(
				parseSafeApiEndpoint(input, {
					allowPlaintext: false,
				}),
			),
		).toBe(input);
	});
});

describe("isLoopbackHostname", () => {
	test.each([
		"localhost",
		"127.0.0.1",
		"127.1.2.3",
		"[::1]",
	])("treats %p as loopback", (hostname) => {
		expect(isLoopbackHostname(hostname)).toBe(true);
	});

	test.each([
		"evil.example",
		"app.rudel.ai",
		// Not loopback: a hostname that merely embeds one.
		"localhost.evil.example",
		"127.0.0.1.evil.example",
		"[::2]",
	])("treats %p as non-loopback", (hostname) => {
		expect(isLoopbackHostname(hostname)).toBe(false);
	});
});

describe("sanitizeForTerminalDisplay", () => {
	test("replaces control characters so escape sequences cannot render", () => {
		const sanitized = sanitizeForTerminalDisplay(`before${ESCAPE}[2Jafter`);

		expect(sanitized).not.toContain(ESCAPE);
		expect(sanitized).toBe("before\u{FFFD}[2Jafter");
	});

	test("leaves ordinary text untouched", () => {
		const input = "https://app.rudel.ai/device?user_code=X";
		expect(sanitizeForTerminalDisplay(input)).toBe(input);
	});

	test("truncates overlong input", () => {
		const sanitized = sanitizeForTerminalDisplay("a".repeat(500));

		expect(sanitized).toHaveLength(201);
		expect(sanitized.endsWith("\u{2026}")).toBe(true);
	});
});
