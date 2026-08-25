export const PRODUCTION_API_BASE = "https://app.rudel.ai";

export function getApiBaseOverride(
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return environment.OPALINE_API_BASE ?? environment.RUDEL_API_BASE;
}

export function getDefaultApiBase(
	environment: NodeJS.ProcessEnv = process.env,
): string {
	return getApiBaseOverride(environment) ?? PRODUCTION_API_BASE;
}
