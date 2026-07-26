import { z } from "zod";

/**
 * Wire formats for the OAuth 2.0 device-authorization flow (RFC 8628) as served
 * by better-auth's `deviceAuthorization` plugin and consumed by the CLI.
 *
 * Every field here is server-controlled, and the CLI prints some of them to a
 * terminal while templating others into URLs and request bodies. These are
 * parsed rather than asserted: a `user_code: null` from a hostile server
 * previously satisfied the `"device_code" in body` guard, reached the terminal
 * sanitizer and threw a TypeError instead of being refused cleanly.
 *
 * Fields the CLI does not read are optional and loosely typed on purpose —
 * tightening them would reject legitimate servers for no security benefit.
 */

// Generous, but an untrusted server should not be able to make the CLI retain
// an unbounded string. Real access tokens can be a few KB.
const MAX_TOKEN_LENGTH = 8192;
const MAX_CODE_LENGTH = 512;
const MAX_URL_LENGTH = 2048;

/** RFC 8628 §5.2 default when the server omits `interval`. */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;

export const DeviceCodeResponseSchema = z.object({
	device_code: z.string().min(1).max(MAX_TOKEN_LENGTH),
	user_code: z.string().min(1).max(MAX_CODE_LENGTH),
	verification_uri: z.string().min(1).max(MAX_URL_LENGTH),
	verification_uri_complete: z.string().min(1).max(MAX_URL_LENGTH).optional(),
	// Both feed polling deadline arithmetic, where a non-finite value would
	// silently poison the comparison. `interval` is optional per RFC 8628, and
	// omitting it used to produce NaN and a busy poll loop.
	expires_in: z.number().finite().positive(),
	interval: z
		.number()
		.finite()
		.nonnegative()
		.default(DEFAULT_POLL_INTERVAL_SECONDS),
});
export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;

export const DeviceTokenResponseSchema = z.object({
	access_token: z.string().min(1).max(MAX_TOKEN_LENGTH),
	token_type: z.string().max(MAX_CODE_LENGTH).optional(),
	expires_in: z.number().finite().optional(),
	scope: z.string().max(MAX_URL_LENGTH).optional(),
});
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

export const CliApiKeyCreateResponseSchema = z.object({
	id: z.string().min(1).max(MAX_CODE_LENGTH),
	key: z.string().min(1).max(MAX_TOKEN_LENGTH),
});
export type CliApiKeyCreateResponse = z.infer<
	typeof CliApiKeyCreateResponseSchema
>;

/**
 * OAuth error payload. Every field is optional because servers vary in which
 * they send, and a failed request may not carry any of them.
 */
export const DeviceFlowErrorResponseSchema = z.object({
	error: z.string().max(MAX_CODE_LENGTH).optional(),
	error_description: z.string().max(MAX_URL_LENGTH).optional(),
	message: z.string().max(MAX_URL_LENGTH).optional(),
});
export type DeviceFlowErrorResponse = z.infer<
	typeof DeviceFlowErrorResponseSchema
>;
