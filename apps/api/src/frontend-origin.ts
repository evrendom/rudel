const DEFAULT_DEV_FRONTEND_ORIGIN = "http://localhost:4011";

// Keep frontend origin lookup in one small helper so email links and auth use
// the same public origin without re-deriving environment rules in each feature.
export function getFrontendOrigin() {
	const configuredOrigin =
		process.env.ALLOWED_ORIGIN ?? DEFAULT_DEV_FRONTEND_ORIGIN;

	return configuredOrigin.replace(/\/+$/u, "");
}
