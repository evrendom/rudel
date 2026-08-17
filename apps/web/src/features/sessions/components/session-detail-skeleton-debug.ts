import type { SessionDetailWindow } from "@rudel/api-routes";

const SESSION_DETAIL_SKELETON_MAX_DELAY_MS = 60_000;

type SessionDetailSkeletonDebugMode =
	| { kind: "off" }
	| { kind: "hold" }
	| { kind: "mix" }
	| { delayMs: number; kind: "delay" };

type SessionDetailSkeletonTurnPolicy = {
	delayMs: number;
	hydrate: boolean;
};

export function resolveSessionDetailSkeletonDebugMode(
	value: string | null,
	isDevelopment: boolean,
): SessionDetailSkeletonDebugMode {
	if (!isDevelopment || !value) {
		return { kind: "off" };
	}
	if (value === "hold") {
		return { kind: "hold" };
	}
	if (value === "mix") {
		return { kind: "mix" };
	}
	if (!value.startsWith("delay:")) {
		return { kind: "off" };
	}
	const delayMs = Number(value.slice("delay:".length));
	if (!Number.isFinite(delayMs) || delayMs < 0) {
		return { kind: "off" };
	}
	return {
		delayMs: Math.min(
			Math.round(delayMs),
			SESSION_DETAIL_SKELETON_MAX_DELAY_MS,
		),
		kind: "delay",
	};
}

export function getSessionDetailSkeletonTurnPolicy(
	mode: SessionDetailSkeletonDebugMode,
	turnIndex: number,
): SessionDetailSkeletonTurnPolicy {
	if (mode.kind === "hold" || (mode.kind === "mix" && turnIndex % 2 === 0)) {
		return { delayMs: 0, hydrate: false };
	}
	return {
		delayMs: mode.kind === "delay" ? mode.delayMs : 0,
		hydrate: true,
	};
}

export function getSessionDetailSkeletonDebugKey(
	mode: SessionDetailSkeletonDebugMode,
) {
	return mode.kind === "delay" ? `delay:${mode.delayMs}` : mode.kind;
}

export function getStableSessionSkeletonWidth(
	turnId: string,
	kind: string,
	index: number,
) {
	const value = `${turnId}:${kind}:${index}`;
	let hash = 2_166_136_261;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return 48 + ((hash >>> 0) % 45);
}

export async function applySessionDetailSkeletonDebugMode(
	window: SessionDetailWindow,
	mode: SessionDetailSkeletonDebugMode,
	signal?: AbortSignal,
) {
	if (mode.kind === "delay") {
		await waitForSessionDetailSkeletonDelay(mode.delayMs, signal);
		return window;
	}
	if (mode.kind === "off") {
		return window;
	}
	return {
		...window,
		turns: window.turns.map((turn) =>
			getSessionDetailSkeletonTurnPolicy(mode, turn.index).hydrate
				? turn
				: { ...turn, body: null },
		),
	};
}

async function waitForSessionDetailSkeletonDelay(
	delayMs: number,
	signal?: AbortSignal,
) {
	if (delayMs <= 0) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const finish = () => {
			signal?.removeEventListener("abort", handleAbort);
			resolve();
		};
		const timeout = window.setTimeout(finish, delayMs);
		const handleAbort = () => {
			window.clearTimeout(timeout);
			signal?.removeEventListener("abort", handleAbort);
			reject(
				signal?.reason ?? new DOMException("Turn load aborted.", "AbortError"),
			);
		};
		if (signal?.aborted) {
			handleAbort();
			return;
		}
		signal?.addEventListener("abort", handleAbort, { once: true });
	});
}
