import { type DesktopWindowChrome, RudelDesktopApp } from "@rudel/desktop-ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { type ReactElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { tauriLocalEngine } from "./tauri-local-engine.js";

export const desktopShellScope = {
	product: "Rudel Desktop",
	shell: "Tauri",
	rule: "Tauri is the first shell, not the architecture.",
} as const;

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Rudel Desktop root element was not found.");
}

const mainWindow = getCurrentWindow();

createRoot(rootElement).render(
	<StrictMode>
		<TauriDesktopRoot />
	</StrictMode>,
);

function TauriDesktopRoot(): ReactElement {
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		let isActive = true;
		let unlistenResize: UnlistenFn | undefined;
		let unlistenFocus: UnlistenFn | undefined;

		async function refreshFullscreenState() {
			try {
				const nextIsFullscreen = await mainWindow.isFullscreen();
				if (isActive) {
					setIsFullscreen(nextIsFullscreen);
				}
			} catch (error) {
				ignoreWindowChromeError(error);
			}
		}

		function queueFullscreenRefresh() {
			void refreshFullscreenState();
		}

		async function registerWindowListeners() {
			await refreshFullscreenState();
			const [nextUnlistenResize, nextUnlistenFocus] = await Promise.all([
				mainWindow.onResized(queueFullscreenRefresh),
				mainWindow.onFocusChanged(queueFullscreenRefresh),
			]);

			if (!isActive) {
				nextUnlistenResize();
				nextUnlistenFocus();
				return;
			}

			unlistenResize = nextUnlistenResize;
			unlistenFocus = nextUnlistenFocus;
		}

		void registerWindowListeners().catch(ignoreWindowChromeError);

		return () => {
			isActive = false;
			unlistenResize?.();
			unlistenFocus?.();
		};
	}, []);

	const windowChrome: DesktopWindowChrome = {
		isFullscreen,
	};

	return (
		<RudelDesktopApp
			localEngine={tauriLocalEngine}
			pickWorkspaceRoots={pickWorkspaceRoots}
			windowChrome={windowChrome}
		/>
	);
}

async function pickWorkspaceRoots(): Promise<readonly string[]> {
	const selected = await open({
		directory: true,
		multiple: true,
	});
	if (Array.isArray(selected)) {
		return selected.filter(isString);
	}
	if (typeof selected === "string") {
		return [selected];
	}
	return [];
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function ignoreWindowChromeError(error: unknown): void {
	void error;
}
