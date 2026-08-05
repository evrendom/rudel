const SESSION_RETURN_STATE_KIND = "session-return";

export type SessionReturnState = {
	kind: typeof SESSION_RETURN_STATE_KIND;
	sourcePath: string;
};

export function createSessionReturnState(
	sourcePath: string,
): SessionReturnState {
	return {
		kind: SESSION_RETURN_STATE_KIND,
		sourcePath,
	};
}

export function isSessionReturnState(
	state: unknown,
): state is SessionReturnState {
	if (
		typeof state !== "object" ||
		state === null ||
		!("kind" in state) ||
		!("sourcePath" in state)
	) {
		return false;
	}

	return (
		state.kind === SESSION_RETURN_STATE_KIND &&
		typeof state.sourcePath === "string" &&
		state.sourcePath.startsWith("/") &&
		!state.sourcePath.startsWith("//")
	);
}

export function runSessionReturnTransition(navigateBack: () => void) {
	const prefersReducedMotion =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	if (
		typeof document === "undefined" ||
		prefersReducedMotion ||
		typeof document.startViewTransition !== "function"
	) {
		navigateBack();
		return;
	}

	document.startViewTransition(navigateBack);
}
