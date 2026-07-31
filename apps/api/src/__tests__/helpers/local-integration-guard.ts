const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

function assertLoopbackDatabaseUrl(environmentVariable: string): void {
	const value = process.env[environmentVariable];
	if (!value) {
		throw new Error(`${environmentVariable} is required for integration tests`);
	}

	const url = new URL(value);
	if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
		throw new Error(
			`${environmentVariable} must use a loopback host for integration tests; received ${url.hostname}`,
		);
	}
}

assertLoopbackDatabaseUrl("CLICKHOUSE_URL");
assertLoopbackDatabaseUrl("PG_CONNECTION_STRING");
