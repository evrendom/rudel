import { describe, expect, test } from "bun:test";
import { buildVerificationUrl } from "../commands/login.js";
import { resolveBrowserOpener } from "../lib/browser-opener.js";

describe("resolveBrowserOpener", () => {
	test("never routes through a shell on Windows", () => {
		// The RUD-203 vulnerability was `spawn("cmd", ["/c", "start", "", url])`.
		// cmd.exe re-parses its command line, so `&` in a server-supplied URL became
		// a command separator. Any opener that re-parses is unacceptable here.
		const { command, args } = resolveBrowserOpener(
			"win32",
			"https://app.rudel.ai/device?user_code=X&calc",
		);

		expect(command).not.toBe("cmd");
		expect(command).not.toBe("cmd.exe");
		expect(command).not.toContain("powershell");
		expect(command).not.toContain("rundll32");
		expect(args).not.toContain("/c");
		expect(args).not.toContain("start");
	});

	test("passes the URL as a single unmodified argument on Windows", () => {
		const url = "https://app.rudel.ai/device?user_code=X&calc";
		const { command, args } = resolveBrowserOpener("win32", url);

		expect(command).toBe("explorer.exe");
		expect(args).toEqual([url]);
	});

	test.each([
		["darwin", "open"],
		["linux", "xdg-open"],
		["freebsd", "xdg-open"],
	])("uses %p opener %p", (platform, expected) => {
		const url = "https://app.rudel.ai/device?user_code=X";
		const { command, args } = resolveBrowserOpener(platform, url);

		expect(command).toBe(expected);
		expect(args).toEqual([url]);
	});
});

describe("buildVerificationUrl", () => {
	test("prefers the server-supplied complete URL", () => {
		expect(
			buildVerificationUrl({
				verification_uri: "https://app.rudel.ai/device",
				verification_uri_complete:
					"https://app.rudel.ai/device?user_code=ABCD1234",
				user_code: "ABCD1234",
			}),
		).toBe("https://app.rudel.ai/device?user_code=ABCD1234");
	});

	test("appends the user code when no complete URL is supplied", () => {
		expect(
			buildVerificationUrl({
				verification_uri: "https://app.rudel.ai/device",
				verification_uri_complete: undefined,
				user_code: "ABCD1234",
			}),
		).toBe("https://app.rudel.ai/device?user_code=ABCD1234");
	});

	test("does not corrupt a verification URI that already has a query string", () => {
		// Regression test: `?`-concatenation produced two `?` separators and a
		// malformed URL. Reachable via CLI_DEVICE_VERIFICATION_URL.
		const built = buildVerificationUrl({
			verification_uri: "https://app.rudel.ai/device?tenant=acme",
			verification_uri_complete: undefined,
			user_code: "ABCD1234",
		});

		expect(built.match(/\?/g)).toHaveLength(1);
		expect(new URL(built).searchParams.get("tenant")).toBe("acme");
		expect(new URL(built).searchParams.get("user_code")).toBe("ABCD1234");
	});

	test("percent-encodes a user code containing URL-significant characters", () => {
		const built = buildVerificationUrl({
			verification_uri: "https://app.rudel.ai/device",
			verification_uri_complete: undefined,
			user_code: "AB&CD=EF",
		});

		expect(new URL(built).searchParams.get("user_code")).toBe("AB&CD=EF");
		expect(built).toContain("AB%26CD%3DEF");
	});

	test("returns a malformed verification URI unchanged for the validator to reject", () => {
		expect(
			buildVerificationUrl({
				verification_uri: "not a url",
				verification_uri_complete: undefined,
				user_code: "ABCD1234",
			}),
		).toBe("not a url");
	});
});
