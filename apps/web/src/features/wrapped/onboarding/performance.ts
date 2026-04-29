export type WrappedMotionPerformanceProfile = "full" | "constrained";

const WRAPPED_CONSTRAINED_HARDWARE_THREADS = 4;
const WRAPPED_CONSTRAINED_DEVICE_MEMORY_GB = 4;
const WRAPPED_CONSTRAINED_MAX_PARTICLE_COUNT = 100;
const WRAPPED_SLOW_EFFECTIVE_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

export function resolveWrappedMotionPerformanceProfile(): WrappedMotionPerformanceProfile {
	if (typeof window === "undefined") {
		return "full";
	}

	if (
		matchesWrappedMotionMediaQuery("(prefers-reduced-data: reduce)") ||
		matchesWrappedMotionMediaQuery("(update: slow)") ||
		isWrappedSaveDataEnabled() ||
		isWrappedSlowEffectiveConnection() ||
		hasWrappedConstrainedDeviceMemory() ||
		hasWrappedConstrainedHardwareConcurrency()
	) {
		return "constrained";
	}

	return "full";
}

export function resolveWrappedMotionParticleCount(input: {
	count: number;
	maximumCount: number;
	minimumCount?: number;
	performanceProfile: WrappedMotionPerformanceProfile;
}) {
	const normalizedCount = Math.max(0, Math.round(input.count));
	const maximumCount = Math.max(0, Math.round(input.maximumCount));
	const profileMaximumCount =
		input.performanceProfile === "constrained"
			? Math.min(maximumCount, WRAPPED_CONSTRAINED_MAX_PARTICLE_COUNT)
			: maximumCount;

	if (normalizedCount <= 0 || profileMaximumCount <= 0) {
		return 0;
	}

	const minimumCount = Math.max(0, Math.round(input.minimumCount ?? 1));
	const cappedCount = Math.min(normalizedCount, profileMaximumCount);

	return Math.min(profileMaximumCount, Math.max(minimumCount, cappedCount));
}

function hasWrappedConstrainedHardwareConcurrency() {
	const hardwareConcurrency = window.navigator.hardwareConcurrency;

	return (
		typeof hardwareConcurrency === "number" &&
		hardwareConcurrency > 0 &&
		hardwareConcurrency <= WRAPPED_CONSTRAINED_HARDWARE_THREADS
	);
}

function hasWrappedConstrainedDeviceMemory() {
	if (!("deviceMemory" in window.navigator)) {
		return false;
	}

	const deviceMemory = window.navigator.deviceMemory;

	return (
		typeof deviceMemory === "number" &&
		deviceMemory > 0 &&
		deviceMemory <= WRAPPED_CONSTRAINED_DEVICE_MEMORY_GB
	);
}

function isWrappedSaveDataEnabled() {
	const connection = resolveWrappedNavigatorConnection();
	if (!connection || !("saveData" in connection)) {
		return false;
	}

	return connection.saveData === true;
}

function isWrappedSlowEffectiveConnection() {
	const connection = resolveWrappedNavigatorConnection();
	if (!connection || !("effectiveType" in connection)) {
		return false;
	}

	const effectiveType = connection.effectiveType;
	if (typeof effectiveType !== "string") {
		return false;
	}

	return WRAPPED_SLOW_EFFECTIVE_CONNECTIONS.has(effectiveType);
}

function resolveWrappedNavigatorConnection() {
	if (!("connection" in window.navigator)) {
		return null;
	}

	const connection = window.navigator.connection;
	if (typeof connection !== "object" || connection === null) {
		return null;
	}

	return connection;
}

function matchesWrappedMotionMediaQuery(query: string) {
	if (typeof window.matchMedia !== "function") {
		return false;
	}

	return window.matchMedia(query).matches;
}
