import { describe, expect, test } from "bun:test";
import {
	CliApiKeyCreateResponseSchema,
	DeviceCodeResponseSchema,
	DeviceFlowErrorResponseSchema,
	DeviceTokenResponseSchema,
} from "../device-flow.js";

const validDeviceCode = {
	device_code: "dc",
	user_code: "ABCD1234",
	verification_uri: "https://app.rudel.ai/device",
	expires_in: 600,
	interval: 5,
};

describe("DeviceCodeResponseSchema", () => {
	test("accepts a well-formed response", () => {
		expect(DeviceCodeResponseSchema.parse(validDeviceCode)).toMatchObject({
			user_code: "ABCD1234",
			interval: 5,
		});
	});

	test.each([
		["user_code", null],
		["user_code", 42],
		["user_code", ""],
		["device_code", null],
		["verification_uri", null],
		["expires_in", "600"],
		["expires_in", Number.NaN],
		["expires_in", Number.POSITIVE_INFINITY],
		["expires_in", -1],
		["interval", Number.NaN],
	])("rejects %s = %p", (field, value) => {
		const result = DeviceCodeResponseSchema.safeParse({
			...validDeviceCode,
			[field]: value,
		});

		expect(result.success).toBe(false);
	});

	test("defaults a missing interval to the RFC 8628 value", () => {
		// Omitting `interval` is legal per RFC 8628 and used to yield NaN, which
		// made Math.max return NaN and turned the poll into a busy loop.
		const { interval, ...withoutInterval } = validDeviceCode;
		expect(interval).toBe(5);

		expect(DeviceCodeResponseSchema.parse(withoutInterval).interval).toBe(5);
	});

	test("accepts an absent verification_uri_complete", () => {
		expect(
			DeviceCodeResponseSchema.parse(validDeviceCode).verification_uri_complete,
		).toBeUndefined();
	});

	test("rejects an absurdly long user_code rather than retaining it", () => {
		const result = DeviceCodeResponseSchema.safeParse({
			...validDeviceCode,
			user_code: "A".repeat(10_000),
		});

		expect(result.success).toBe(false);
	});
});

describe("DeviceTokenResponseSchema", () => {
	test("accepts a response carrying only access_token", () => {
		// token_type/expires_in/scope are unused by the CLI, so requiring them
		// would reject legitimate servers for no security benefit.
		expect(
			DeviceTokenResponseSchema.parse({ access_token: "at" }).access_token,
		).toBe("at");
	});

	test.each([null, 42, ""])("rejects access_token = %p", (value) => {
		expect(
			DeviceTokenResponseSchema.safeParse({ access_token: value }).success,
		).toBe(false);
	});
});

describe("CliApiKeyCreateResponseSchema", () => {
	test("accepts a well-formed response", () => {
		expect(CliApiKeyCreateResponseSchema.parse({ id: "1", key: "k" })).toEqual({
			id: "1",
			key: "k",
		});
	});

	test.each([
		{ id: "1" },
		{ key: "k" },
		{ id: null, key: "k" },
		{ id: "1", key: 42 },
	])("rejects %p", (body) => {
		expect(CliApiKeyCreateResponseSchema.safeParse(body).success).toBe(false);
	});
});

describe("DeviceFlowErrorResponseSchema", () => {
	test("accepts an empty object, since a failure may carry no payload", () => {
		expect(DeviceFlowErrorResponseSchema.parse({})).toEqual({});
	});

	test("extracts the standard OAuth error fields", () => {
		expect(
			DeviceFlowErrorResponseSchema.parse({
				error: "authorization_pending",
				error_description: "still waiting",
			}),
		).toMatchObject({ error: "authorization_pending" });
	});

	test.each([null, "a string", 42])("rejects non-object %p", (body) => {
		expect(DeviceFlowErrorResponseSchema.safeParse(body).success).toBe(false);
	});
});
