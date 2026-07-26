import { spawn } from "node:child_process";

export interface BrowserOpenerCommand {
	command: string;
	args: string[];
	/**
	 * Whether to spawn the opener detached. Must be false on Windows:
	 * DETACHED_PROCESS makes Start-Process report success while the browser
	 * launch silently dies (bisected empirically on windows-2025 CI). The CLI
	 * outlives the ~1s opener anyway, and Windows does not kill children on
	 * parent exit. POSIX stays detached because xdg-open can outlive the login.
	 */
	detach: boolean;
	/**
	 * Extra environment for the spawned process. On Windows the URL travels here
	 * rather than in `args`, so its bytes never cross a command-line parser.
	 */
	env?: Record<string, string>;
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
 * cmd.exe verbatim as command separators. `explorer.exe` was the first
 * replacement, but it silently ignores http URLs that carry a query string
 * (observed on windows-2025; caught by the Windows integration test), so the
 * browser never opened. This opener ShellExecutes via `Start-Process` instead,
 * with the URL passed out-of-band in an environment variable: the `-Command`
 * text is a compile-time constant, so PowerShell never parses a byte of the URL
 * and there is nothing to inject into. Plain text, not the EDR-flagged
 * `-EncodedCommand` pattern the `open` package uses, and not the `rundll32`
 * LOLBin.
 */
export function resolveBrowserOpener(
	platform: string,
	url: string,
): BrowserOpenerCommand {
	if (platform === "win32") {
		return {
			command: "powershell.exe",
			args: [
				"-NoProfile",
				"-NonInteractive",
				"-WindowStyle",
				"Hidden",
				"-Command",
				"Start-Process -FilePath $env:RUDEL_OPEN_URL",
			],
			detach: false,
			env: { RUDEL_OPEN_URL: url },
		};
	}
	if (platform === "darwin") {
		return { command: "open", args: [url], detach: true };
	}
	return { command: "xdg-open", args: [url], detach: true };
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
	const { command, args, detach, env } = resolveBrowserOpener(
		process.platform,
		url,
	);
	const child = spawn(command, args, {
		detached: detach,
		stdio: "ignore",
		windowsHide: true,
		env: env ? { ...process.env, ...env } : process.env,
	});
	// A missing opener (for example a headless Linux box with no xdg-open) emits
	// "error"; with no listener that becomes an uncaught exception and aborts the
	// login. The URL has already been printed, so failing quietly is correct.
	child.on("error", () => {});
	child.unref();
}
