type DebugFields = Readonly<Record<string, boolean | number | string | null>>;

export function isDebugLoggingEnabled(
	environment: NodeJS.ProcessEnv = process.env,
): boolean {
	return environment.OPALINE_LOG_LEVEL?.trim().toLowerCase() === "debug";
}

export function debugLog(message: string, fields?: DebugFields): void {
	if (!isDebugLoggingEnabled()) return;
	const detail = fields ? ` ${JSON.stringify(fields)}` : "";
	process.stderr.write(`[opaline:debug] ${message}${detail}\n`);
}
