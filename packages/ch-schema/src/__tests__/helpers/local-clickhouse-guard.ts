const clickHouseUrl = process.env.CLICKHOUSE_URL;
if (!clickHouseUrl) {
	throw new Error("CLICKHOUSE_URL is required for integration tests");
}

const hostname = new URL(clickHouseUrl).hostname;
if (!new Set(["127.0.0.1", "::1", "localhost"]).has(hostname)) {
	throw new Error(
		`CLICKHOUSE_URL must use a loopback host for integration tests; received ${hostname}`,
	);
}
