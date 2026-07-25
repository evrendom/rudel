/**
 * Credential resolution for the chkit ClickHouse connection.
 *
 * Kept free of `@chkit/core` imports so it can be unit-tested without pulling
 * in `@clickhouse/client` (see CLAUDE.md on the barrel-import failure).
 */

/**
 * Hosts we treat as a developer's own machine. Private ranges (10.x,
 * 172.16-31.x, 192.168.x) are deliberately excluded — those can be a production
 * cluster on a private network, and guessing wrong there is the failure this
 * module exists to prevent.
 */
const LOCAL_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1",
	"[::1]",
	"host.docker.internal",
]);

/** Treats an unparseable URL as remote, so a malformed value fails closed. */
export function isLocalClickHouseEndpoint(url: string | undefined): boolean {
	if (!url) return false;
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

function readTrimmed(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Resolves the username chkit authenticates with.
 *
 * `default` is the ClickHouse superuser, so it is only ever assumed for a local
 * endpoint — scripts/dev-local.sh sets no username for the Docker container.
 * Against a remote endpoint a missing username is an error, never a silent
 * fall back to `default`.
 *
 * @throws if a remote endpoint has no username, or if the canonical and legacy
 * variables disagree (ambiguous identity is exactly how migrations silently ran
 * as `default`).
 */
export interface ClickHouseUsernameEnv {
	CLICKHOUSE_USERNAME?: string | undefined;
	CLICKHOUSE_USER?: string | undefined;
}

export function resolveClickHouseUsername(
	env: ClickHouseUsernameEnv,
	url: string | undefined,
): string {
	const canonical = readTrimmed(env.CLICKHOUSE_USERNAME);
	const legacy = readTrimmed(env.CLICKHOUSE_USER);

	if (canonical && legacy && canonical !== legacy) {
		throw new Error(
			"CLICKHOUSE_USERNAME and CLICKHOUSE_USER are both set to different " +
				"values, so the identity to connect as is ambiguous. Unset " +
				"CLICKHOUSE_USER and keep CLICKHOUSE_USERNAME.",
		);
	}

	const username = canonical ?? legacy;
	if (username) return username;

	if (isLocalClickHouseEndpoint(url)) return "default";

	throw new Error(
		"CLICKHOUSE_USERNAME is required for a non-local ClickHouse endpoint. " +
			"Refusing to fall back to the `default` superuser. Set " +
			"CLICKHOUSE_USERNAME to a least-privilege identity.",
	);
}
