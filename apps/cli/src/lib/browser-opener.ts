import { spawn } from "node:child_process";

export interface BrowserOpenerCommand {
	command: string;
	args: string[];
}

/**
 * Resolve the platform opener for a URL.
 *
 * Takes `platform` as an argument rather than reading `process.platform` so the
 * Windows branch is assertable from any host.
 *
 * The Windows branch must never route through a shell (RUD-203). `cmd.exe`
 * re-parses its command line, and libuv only quotes arguments containing space,
 * tab or `"`, so `&`, `|`, `^`, `(` and `)` in a server-supplied URL reach
 * cmd.exe verbatim as command separators. `explorer.exe` receives the URL as a
 * single argument with no re-parsing, adds no dependency, and avoids both the
 * EDR-flagged `rundll32` LOLBin and the base64-encoded-PowerShell pattern that
 * the `open` package uses.
 */
export function resolveBrowserOpener(
	platform: string,
	url: string,
): BrowserOpenerCommand {
	if (platform === "win32") {
		return { command: "explorer.exe", args: [url] };
	}
	if (platform === "darwin") {
		return { command: "open", args: [url] };
	}
	return { command: "xdg-open", args: [url] };
}

/**
 * Open a URL in the user's default browser.
 *
 * The URL must already have passed `parseSafeBrowserUrl`. On macOS and Linux the
 * opener itself is shell-free but still dispatches arbitrary registered URL
 * schemes and accepts filesystem paths, so validation — not this function — is
 * what protects those platforms.
 */
export function openUrl(url: string): void {
	const { command, args } = resolveBrowserOpener(process.platform, url);
	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
	});
	// A missing opener (for example a headless Linux box with no xdg-open) emits
	// "error"; with no listener that becomes an uncaught exception and aborts the
	// login. The URL has already been printed, so failing quietly is correct.
	child.on("error", () => {});
	child.unref();
}
