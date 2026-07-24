const MINIMUM_AUTH_SECRET_LENGTH = 32;

export function readBetterAuthSecret(): string {
	return readRequiredSecretEnv(
		"BETTER_AUTH_SECRET",
		MINIMUM_AUTH_SECRET_LENGTH,
	);
}

export function readPositiveSafeIntegerEnv(
	name: string,
	defaultValue: number,
): number {
	const rawValue = process.env[name];
	if (rawValue === undefined) {
		return defaultValue;
	}

	const parsedValue = Number(rawValue);
	if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}

	return parsedValue;
}

export function readRequiredSecretEnv(
	name: string,
	minimumLength: number,
): string {
	const value = process.env[name]?.trim();
	if (!value || value.length < minimumLength) {
		throw new Error(
			`${name} must be set to at least ${minimumLength} characters`,
		);
	}

	return value;
}
