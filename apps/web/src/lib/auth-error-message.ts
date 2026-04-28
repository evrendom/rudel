interface FormatAuthErrorMessageInput {
	error: unknown;
	fallbackMessage: string;
	operation: string;
}

const DEV_AUTH_ERROR_FIELD_NAMES = [
	"name",
	"code",
	"status",
	"statusCode",
	"statusText",
	"message",
] as const;

export function formatAuthErrorMessage(input: FormatAuthErrorMessageInput) {
	const baseMessage =
		getStringField(input.error, "message") ?? input.fallbackMessage;

	if (!import.meta.env.DEV) {
		return baseMessage;
	}

	return [baseMessage, "", ...getDevAuthErrorDetails(input)].join("\n");
}

function getDevAuthErrorDetails(input: FormatAuthErrorMessageInput) {
	const lines = [
		"Dev auth details:",
		`Operation: ${input.operation}`,
		`Page URL: ${getBrowserHref()}`,
		`Request origin: ${getBrowserOrigin()}`,
		'Auth client: same-origin Better Auth client (baseURL: "")',
	];

	for (const fieldName of DEV_AUTH_ERROR_FIELD_NAMES) {
		const value = getObjectValue(input.error, fieldName);
		if (value !== undefined && value !== null && value !== "") {
			lines.push(`error.${fieldName}: ${formatErrorValue(value)}`);
		}
	}

	if (isInvalidOriginError(input.error)) {
		lines.push(
			"Likely fix: add the request origin to the API trusted origins via ALLOWED_ORIGIN or TRUSTED_ORIGINS, then restart the API server.",
		);
	}

	return lines;
}

function getBrowserHref() {
	if (typeof window === "undefined") {
		return "unavailable outside browser";
	}

	return window.location.href;
}

function getBrowserOrigin() {
	if (typeof window === "undefined") {
		return "unavailable outside browser";
	}

	return window.location.origin;
}

function getStringField(input: unknown, key: string) {
	const value = getObjectValue(input, key);
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function getObjectValue(input: unknown, key: string): unknown {
	if (typeof input !== "object" || input === null || !(key in input)) {
		return undefined;
	}

	return Reflect.get(input, key);
}

function formatErrorValue(value: unknown) {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return String(value);
	}

	return Object.prototype.toString.call(value);
}

function isInvalidOriginError(error: unknown) {
	const code = getStringField(error, "code")?.toLowerCase();
	const message = getStringField(error, "message")?.toLowerCase();
	return (
		code === "invalid_origin" || message?.includes("invalid origin") === true
	);
}
