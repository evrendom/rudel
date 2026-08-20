import { afterEach, describe, expect, test } from "bun:test";
import { uploadSession } from "../../apps/cli/src/lib/uploader.js";
import {
	configurePlaygroundStub,
	type PlaygroundStub,
	startPlaygroundStub,
} from "./stub-server.js";

const IDENTITY = {
	user: {
		id: "user_test",
		email: "test@loopback.invalid",
		name: "Test Designer",
	},
	organizations: [{ id: "org_test", name: "Test Lab", slug: "test-lab" }],
};

let activeStub: PlaygroundStub | null = null;

afterEach(async () => {
	await activeStub?.stop();
	activeStub = null;
});

describe("design playground stub", () => {
	test("serves identity, upload, and fixture login contracts", async () => {
		activeStub = startPlaygroundStub({ crashOnTripwire: false });
		await configurePlaygroundStub(
			activeStub.loopbackBase,
			activeStub.secret,
			"ok",
			IDENTITY,
		);

		const [
			identityResponse,
			uploadStatusResponse,
			uploadResponse,
			deviceResponse,
		] = await Promise.all([
			fetch(`${activeStub.loopbackBase}/rpc/cli/authStatus`, {
				method: "POST",
			}),
			fetch(`${activeStub.loopbackBase}/rpc/cli/sessionUploadStatus`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					json: {
						organizationId: "org_override",
						sessionIds: ["local-session"],
					},
				}),
			}),
			fetch(`${activeStub.loopbackBase}/rpc/ingestSession`, {
				method: "POST",
				headers: {
					Authorization: "Bearer must-not-appear",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content: "private transcript body" }),
			}),
			fetch(`${activeStub.loopbackBase}/api/auth/device/code`, {
				method: "POST",
			}),
		]);

		expect(identityResponse.status).toBe(200);
		expect(await identityResponse.json()).toEqual({ json: IDENTITY.user });
		expect(await uploadStatusResponse.json()).toEqual({
			json: {
				organizationId: "org_override",
				uploadedSessionIds: [],
			},
		});
		expect(uploadResponse.status).toBe(200);
		expect(deviceResponse.status).toBe(200);
		const device: unknown = await deviceResponse.json();
		expect(isRecord(device) && device.verification_uri).toBe(
			`${activeStub.loopbackBase}/verify/device`,
		);
		const serializedLogs = JSON.stringify(activeStub.getLogs());
		expect(serializedLogs).not.toContain("must-not-appear");
		expect(serializedLogs).not.toContain("private transcript body");
	});

	test("retries 503 twice, keeps 429 terminal, and latches the Host tripwire", async () => {
		activeStub = startPlaygroundStub({ crashOnTripwire: false });
		await configurePlaygroundStub(
			activeStub.loopbackBase,
			activeStub.secret,
			"retry-choreo",
			IDENTITY,
		);

		const retryStatuses: number[] = [];
		for (let index = 0; index < 3; index++) {
			const response = await fetch(
				`${activeStub.loopbackBase}/rpc/ingestSession`,
				{
					method: "POST",
				},
			);
			retryStatuses.push(response.status);
		}
		expect(retryStatuses).toEqual([503, 503, 200]);

		await configurePlaygroundStub(
			activeStub.loopbackBase,
			activeStub.secret,
			"rate-limit",
			IDENTITY,
		);
		const rateLimited = await fetch(
			`${activeStub.loopbackBase}/rpc/ingestSession`,
			{ method: "POST" },
		);
		expect(rateLimited.status).toBe(429);
		expect(rateLimited.headers.get("retry-after")).toBe("42");
		const rateBody: unknown = await rateLimited.json();
		expect(readRpcErrorData(rateBody, "reason")).toBe("session_limit");
		expect(readRpcErrorData(rateBody, "limit")).toBe(25);

		const hostile = await fetch(
			`${activeStub.loopbackBase}/rpc/ingestSession`,
			{
				method: "POST",
				headers: { Host: "example.com" },
			},
		);
		expect(hostile.status).toBe(421);
		expect(activeStub.getTripwire()).toContain("example.com");
	});

	test("returns only requested fixture sessions marked as uploaded", async () => {
		activeStub = startPlaygroundStub({ crashOnTripwire: false });
		await configurePlaygroundStub(
			activeStub.loopbackBase,
			activeStub.secret,
			"uploaded-mixed",
			IDENTITY,
		);

		const response = await fetch(
			`${activeStub.loopbackBase}/rpc/cli/sessionUploadStatus`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					json: {
						organizationId: "org_test",
						sessionIds: [
							"fixture-current-01",
							"fixture-api-02",
							"fixture-api-03",
						],
					},
				}),
			},
		);

		expect(await response.json()).toEqual({
			json: {
				organizationId: "org_test",
				uploadedSessionIds: ["fixture-current-01", "fixture-api-02"],
			},
		});
	});

	test("drives the real uploader's terminal 429 message without retrying", async () => {
		activeStub = startPlaygroundStub({ crashOnTripwire: false });
		await configurePlaygroundStub(
			activeStub.loopbackBase,
			activeStub.secret,
			"rate-limit",
			IDENTITY,
		);

		const result = await uploadSession(
			{
				source: "claude_code",
				sessionId: "playground-rate-limit",
				projectPath: "/playground/project",
				content: `${JSON.stringify({
					type: "user",
					timestamp: "2026-08-20T08:00:00.000Z",
				})}\n`,
				upload_mode: "manual",
			},
			{
				endpoint: `${activeStub.loopbackBase}/rpc`,
				token: "playground-marker",
				authType: "api-key",
				allowInsecureEndpoint: false,
			},
		);

		expect(result.success).toBe(false);
		expect("error" in result ? result.error : "").toContain(
			"25 sessions per 60 min",
		);
		expect(
			activeStub
				.getLogs()
				.filter((entry) => entry.path === "/rpc/ingestSession"),
		).toHaveLength(1);
	});
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readRpcErrorData(value: unknown, key: string): unknown {
	if (!isRecord(value) || !isRecord(value.json) || !isRecord(value.json.data)) {
		throw new Error("Stub did not return an oRPC error envelope");
	}
	return value.json.data[key];
}
