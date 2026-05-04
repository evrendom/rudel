import { describe, expect, test } from "bun:test";
import assert from "node:assert";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";
import {
	createYcLoginPlugin,
	getYcLoginConfigFromEnv,
	isYcReviewSessionRecord,
} from "../auth.js";

const TARGET_EMAIL = "evren@example.com";
const TARGET_PASSWORD = "target-password";
const YC_PASSWORD = "yc-password";

describe("YC login config", () => {
	test("loads and normalizes YC login env config", () => {
		const config = getYcLoginConfigFromEnv({
			YC_LOGIN_ALLOWED_EMAILS:
				" Applicant@YCombinator.com, partner@ycombinator.com ",
			YC_LOGIN_PASSWORD_HASH: "hash-value",
			YC_LOGIN_TARGET_EMAIL: " Evren@Example.com ",
		});

		expect(config.allowedEmails).toEqual([
			"applicant@ycombinator.com",
			"partner@ycombinator.com",
		]);
		expect(config.passwordHash).toBe("hash-value");
		expect(config.targetEmail).toBe("evren@example.com");
	});
});

describe("YC login endpoint", () => {
	test("signs an allowed YC email into the configured target account", async () => {
		const auth = await createTestAuth();

		const response = await auth.handler(
			new Request("http://localhost/api/auth/yc/sign-in", {
				body: JSON.stringify({
					email: "APPLICANT@YCOMBINATOR.COM",
					password: YC_PASSWORD,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toContain(
			"better-auth.session_token",
		);
		const sessionCookie = getSessionCookie(response);
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: sessionCookie }),
		});
		assert(session);
		expect(isYcReviewSessionRecord(session.session)).toBe(true);

		const body: unknown = await response.json();
		assert(isYcLoginResponse(body));
		expect(body.user.email).toBe(TARGET_EMAIL);
	});

	test("rejects emails outside the configured allowlist", async () => {
		const auth = await createTestAuth();

		const response = await auth.handler(
			new Request("http://localhost/api/auth/yc/sign-in", {
				body: JSON.stringify({
					email: "outsider@ycombinator.com",
					password: YC_PASSWORD,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("Set-Cookie")).toBeNull();
	});

	test("rejects an invalid YC password", async () => {
		const auth = await createTestAuth();

		const response = await auth.handler(
			new Request("http://localhost/api/auth/yc/sign-in", {
				body: JSON.stringify({
					email: "applicant@ycombinator.com",
					password: "wrong-password",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("Set-Cookie")).toBeNull();
	});

	test("blocks account settings endpoints for YC review sessions", async () => {
		const auth = await createTestAuth();
		const signInResponse = await auth.handler(
			new Request("http://localhost/api/auth/yc/sign-in", {
				body: JSON.stringify({
					email: "applicant@ycombinator.com",
					password: YC_PASSWORD,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
		const sessionCookie = getSessionCookie(signInResponse);

		const response = await auth.handler(
			new Request("http://localhost/api/auth/update-user", {
				body: JSON.stringify({ name: "Changed Name" }),
				headers: {
					"Content-Type": "application/json",
					cookie: sessionCookie,
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(403);
	});
});

function getSessionCookie(response: Response) {
	const setCookie = response.headers.get("Set-Cookie");
	assert(setCookie);
	const sessionCookie = setCookie.split(";")[0];
	assert(sessionCookie);

	return sessionCookie;
}

async function createTestAuth() {
	const passwordHash = await hashPassword(YC_PASSWORD);
	const ycLoginPlugin = createYcLoginPlugin({
		allowedEmails: ["applicant@ycombinator.com", "partner@ycombinator.com"],
		passwordHash,
		targetEmail: TARGET_EMAIL,
	});
	assert(ycLoginPlugin);

	const auth = betterAuth({
		baseURL: "http://localhost",
		database: memoryAdapter({
			account: [],
			session: [],
			user: [],
			verification: [],
		}),
		emailAndPassword: { enabled: true },
		plugins: [ycLoginPlugin],
		secret: "test-secret-that-is-long-enough-for-auth",
	});

	await auth.api.signUpEmail({
		body: {
			email: TARGET_EMAIL,
			name: "Evren",
			password: TARGET_PASSWORD,
		},
		headers: new Headers(),
	});

	return auth;
}

function isYcLoginResponse(
	value: unknown,
): value is { user: { email: string } } {
	return (
		isRecord(value) &&
		isRecord(value.user) &&
		typeof value.user.email === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
