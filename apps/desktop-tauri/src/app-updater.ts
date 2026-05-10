import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

const updateCheckDelayMs = 2000;
const updateCheckTimeoutMs = 30000;

export function scheduleDesktopUpdateCheck(): void {
	if (isDesktopDevServer()) {
		return;
	}

	globalThis.setTimeout(() => {
		void checkForDesktopUpdate();
	}, updateCheckDelayMs);
}

async function checkForDesktopUpdate(): Promise<void> {
	try {
		const update = await check({ timeout: updateCheckTimeoutMs });
		if (!update) {
			return;
		}

		const shouldInstall = globalThis.confirm(
			`Nua ${update.version} is available. Install it now? The app will restart.`,
		);
		if (!shouldInstall) {
			return;
		}

		await update.downloadAndInstall();
		await relaunch();
	} catch (error: unknown) {
		console.warn("Nua update check failed", error);
	}
}

function isDesktopDevServer(): boolean {
	const { hostname, protocol } = globalThis.location;
	const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
	return isLocalHost && (protocol === "http:" || protocol === "https:");
}
