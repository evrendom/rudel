import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { MINIMUM_SESSION_DETAIL_PANE_WIDTH_PX } from "./session-detail-pane-sizing";
import {
	SESSION_WORKSPACE_RESIZE_END_EVENT,
	SESSION_WORKSPACE_RESIZE_START_EVENT,
} from "./session-workspace-resize-behavior";

const SESSION_LIST_PANE_MIN_WIDTH = 320;
const SESSION_LIST_PANE_KEYBOARD_STEP = 24;
const SESSION_LIST_PANE_STORAGE_KEY = "rudel:session-list-pane-width";
const SESSION_LIST_PANE_WIDTH_PROPERTY = "--session-list-pane-width";

function getSessionListPaneBounds(workspaceWidth: number) {
	return {
		maximum: Math.max(
			SESSION_LIST_PANE_MIN_WIDTH,
			Math.round(workspaceWidth - MINIMUM_SESSION_DETAIL_PANE_WIDTH_PX),
		),
		minimum: SESSION_LIST_PANE_MIN_WIDTH,
	};
}

function clampWidth(width: number, minimum: number, maximum: number) {
	return Math.min(Math.max(Math.round(width), minimum), maximum);
}

function readStoredWidth(storageKey: string) {
	try {
		const value = Number.parseFloat(sessionStorage.getItem(storageKey) ?? "");
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

function storeWidth(storageKey: string, width: number) {
	try {
		sessionStorage.setItem(storageKey, String(width));
	} catch {
		// The split still works when storage is unavailable.
	}
}

export function SessionWorkspaceResizeHandle({
	storageKey = SESSION_LIST_PANE_STORAGE_KEY,
}: {
	storageKey?: string;
}) {
	const handleRef = useRef<HTMLHRElement>(null);
	const shellWindowRef = useRef<HTMLElement | null>(null);
	const workspaceElementRef = useRef<HTMLElement | null>(null);
	const widthRef = useRef<number | null>(null);
	const isResizingRef = useRef(false);
	const previousCursorRef = useRef("");
	const previousUserSelectRef = useRef("");

	const updateHandleValue = useCallback((width: number, maximum: number) => {
		const handle = handleRef.current;
		if (!handle) return;
		handle.setAttribute("aria-valuemax", String(maximum));
		handle.setAttribute("aria-valuenow", String(width));
		handle.setAttribute("aria-valuetext", `${width}px overview width`);
	}, []);

	const applyWidth = useCallback(
		(width: number, shouldPersist: boolean) => {
			const workspace = workspaceElementRef.current;
			const shellWindow = shellWindowRef.current;
			if (!workspace || !shellWindow) return;

			const { maximum, minimum } = getSessionListPaneBounds(
				workspace.getBoundingClientRect().width,
			);
			const nextWidth = clampWidth(width, minimum, maximum);
			shellWindow.style.setProperty(
				SESSION_LIST_PANE_WIDTH_PROPERTY,
				`${nextWidth}px`,
			);
			widthRef.current = nextWidth;
			updateHandleValue(nextWidth, maximum);
			if (shouldPersist) storeWidth(storageKey, nextWidth);
		},
		[storageKey, updateHandleValue],
	);

	function finishPointerResize(event?: ReactPointerEvent<HTMLHRElement>) {
		if (!isResizingRef.current) return;
		if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		document.body.style.cursor = previousCursorRef.current;
		document.body.style.userSelect = previousUserSelectRef.current;
		isResizingRef.current = false;
		if (widthRef.current !== null) storeWidth(storageKey, widthRef.current);
		workspaceElementRef.current?.dispatchEvent(
			new Event(SESSION_WORKSPACE_RESIZE_END_EVENT),
		);
	}

	useLayoutEffect(() => {
		const workspace = handleRef.current?.closest<HTMLElement>(
			'[data-slot="session-workspace"]',
		);
		if (!workspace) return;
		const shellWindow = workspace.closest<HTMLElement>(".dashboard-01-window");
		if (!shellWindow) return;
		shellWindowRef.current = shellWindow;
		workspaceElementRef.current = workspace;

		const storedWidth = readStoredWidth(storageKey);
		const listPane = workspace.querySelector<HTMLElement>(
			'[data-slot="sessions-list-pane"]',
		);
		const initialWidth =
			storedWidth ?? listPane?.getBoundingClientRect().width ?? 0;
		if (initialWidth > 0) applyWidth(initialWidth, false);

		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(() => {
						if (widthRef.current !== null) applyWidth(widthRef.current, false);
					});
		observer?.observe(workspace);
		return () => {
			observer?.disconnect();
			if (isResizingRef.current) {
				document.body.style.cursor = previousCursorRef.current;
				document.body.style.userSelect = previousUserSelectRef.current;
			}
			isResizingRef.current = false;
			workspaceElementRef.current = null;
			shellWindowRef.current = null;
		};
	}, [applyWidth, storageKey]);

	return (
		<hr
			ref={handleRef}
			aria-label="Resize sessions overview and detail panes"
			aria-orientation="vertical"
			aria-valuemax={SESSION_LIST_PANE_MIN_WIDTH}
			aria-valuemin={SESSION_LIST_PANE_MIN_WIDTH}
			aria-valuenow={SESSION_LIST_PANE_MIN_WIDTH}
			className="relative z-30 -mx-1.5 hidden h-full w-3 shrink-0 cursor-col-resize touch-none border-0 bg-transparent outline-none before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-black/6 hover:before:bg-black/15 focus-visible:before:bg-(--session-overview-accent) sm:block dark:before:bg-white/8 dark:hover:before:bg-white/20"
			onDoubleClick={() => {
				const shellWindow = shellWindowRef.current;
				if (!shellWindow) return;
				shellWindow.style.removeProperty(SESSION_LIST_PANE_WIDTH_PROPERTY);
				try {
					sessionStorage.removeItem(storageKey);
				} catch {
					// The default width still applies when storage is unavailable.
				}
				requestAnimationFrame(() => {
					const listPane =
						workspaceElementRef.current?.querySelector<HTMLElement>(
							'[data-slot="sessions-list-pane"]',
						);
					if (listPane)
						applyWidth(listPane.getBoundingClientRect().width, false);
				});
			}}
			onKeyDown={(event) => {
				const workspace = workspaceElementRef.current;
				if (!workspace) return;
				const { maximum, minimum } = getSessionListPaneBounds(
					workspace.getBoundingClientRect().width,
				);
				const currentWidth = widthRef.current ?? minimum;
				const step = event.shiftKey
					? SESSION_LIST_PANE_KEYBOARD_STEP * 3
					: SESSION_LIST_PANE_KEYBOARD_STEP;
				let nextWidth: number | null = null;
				switch (event.key) {
					case "ArrowLeft":
						nextWidth = currentWidth - step;
						break;
					case "ArrowRight":
						nextWidth = currentWidth + step;
						break;
					case "Home":
						nextWidth = minimum;
						break;
					case "End":
						nextWidth = maximum;
						break;
				}
				if (nextWidth === null) return;
				event.preventDefault();
				applyWidth(nextWidth, true);
			}}
			onPointerCancel={finishPointerResize}
			onPointerDown={(event) => {
				if (event.isPrimary === false || event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				previousCursorRef.current = document.body.style.cursor;
				previousUserSelectRef.current = document.body.style.userSelect;
				document.body.style.cursor = "col-resize";
				document.body.style.userSelect = "none";
				isResizingRef.current = true;
				workspaceElementRef.current?.dispatchEvent(
					new Event(SESSION_WORKSPACE_RESIZE_START_EVENT),
				);
			}}
			onPointerMove={(event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const workspace = workspaceElementRef.current;
				if (!workspace) return;
				applyWidth(
					event.clientX - workspace.getBoundingClientRect().left,
					false,
				);
			}}
			onPointerUp={finishPointerResize}
			tabIndex={0}
		/>
	);
}
