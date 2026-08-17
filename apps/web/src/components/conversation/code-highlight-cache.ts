// Worker requests must start after commit, never during row render.
// biome-ignore lint/style/noRestrictedImports: Synchronizes the token cache with an external Worker.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
	CodeHighlightRequest,
	CodeHighlightResponse,
	CodeHighlightTheme,
	PreparedCodeHighlight,
} from "./code-highlight-types";

const CODE_HIGHLIGHT_CACHE_LIMIT = 64;
const cache = new Map<string, PreparedCodeHighlight>();
const pendingKeys = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let highlightWorker: Worker | undefined;

function getCodeHighlightKey(input: {
	code: string;
	language: string;
	theme: CodeHighlightTheme;
}) {
	return `${input.theme}\u0000${input.language.toLowerCase()}\u0000${input.code}`;
}

function cacheHighlight(highlight: PreparedCodeHighlight) {
	cache.delete(highlight.key);
	cache.set(highlight.key, highlight);
	while (cache.size > CODE_HIGHLIGHT_CACHE_LIMIT) {
		const oldest = cache.keys().next();
		if (oldest.done) {
			break;
		}
		cache.delete(oldest.value);
	}
}

function getHighlightWorker() {
	if (highlightWorker || typeof Worker !== "function") {
		return highlightWorker;
	}
	highlightWorker = new Worker(
		new URL("./code-highlight-worker.ts", import.meta.url),
		{ type: "module" },
	);
	highlightWorker.addEventListener(
		"message",
		(event: MessageEvent<CodeHighlightResponse>) => {
			const highlight = event.data;
			pendingKeys.delete(highlight.key);
			cacheHighlight(highlight);
			const commitTime = performance.now();
			window.__transcriptTrace?.recordSyntaxHighlight({
				actualDuration: highlight.durationMs,
				charCount: highlight.charCount,
				commitTime,
				language: highlight.language,
				phase: "update",
				startTime: commitTime - highlight.durationMs,
			});
			for (const listener of listeners.get(highlight.key) ?? []) {
				listener();
			}
		},
	);
	return highlightWorker;
}

function requestCodeHighlight(request: CodeHighlightRequest) {
	const cached = cache.get(request.key);
	if (cached) {
		cacheHighlight(cached);
		return;
	}
	if (pendingKeys.has(request.key)) {
		return;
	}
	const worker = getHighlightWorker();
	if (!worker) {
		return;
	}
	pendingKeys.add(request.key);
	worker.postMessage(request);
}

function subscribeCodeHighlight(key: string, listener: () => void) {
	const keyListeners = listeners.get(key) ?? new Set();
	keyListeners.add(listener);
	listeners.set(key, keyListeners);
	return () => {
		keyListeners.delete(listener);
		if (keyListeners.size === 0) {
			listeners.delete(key);
		}
	};
}

export function usePreparedCodeHighlight(input: {
	code: string;
	language: string;
	theme: CodeHighlightTheme;
}) {
	const { code, language, theme } = input;
	const key = getCodeHighlightKey(input);
	const subscribe = useCallback(
		(listener: () => void) => subscribeCodeHighlight(key, listener),
		[key],
	);
	const getSnapshot = useCallback(() => cache.get(key) ?? null, [key]);
	const getServerSnapshot = useCallback(() => null, []);
	const highlight = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	// This effect is the external-system boundary: rendering stays synchronous
	// and plain while the module worker prepares tokens off the main thread.
	useEffect(() => {
		requestCodeHighlight({ code, key, language, theme });
	}, [code, key, language, theme]);
	return highlight;
}
