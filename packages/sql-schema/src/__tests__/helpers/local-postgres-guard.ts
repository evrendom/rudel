const postgresUrl = process.env.PG_CONNECTION_STRING;
if (!postgresUrl) {
	throw new Error("PG_CONNECTION_STRING is required for integration tests");
}

const hostname = new URL(postgresUrl).hostname;
if (!new Set(["127.0.0.1", "::1", "localhost"]).has(hostname)) {
	throw new Error(
		`PG_CONNECTION_STRING must use a loopback host for integration tests; received ${hostname}`,
	);
}
