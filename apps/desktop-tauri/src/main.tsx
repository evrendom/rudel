import { RudelDesktopApp } from "@rudel/desktop-ui";
import { tauriLocalEngine } from "./tauri-local-engine.js";

export const desktopShellScope = {
	product: "Rudel Desktop",
	shell: "Tauri",
	rule: "Tauri is the first shell, not the architecture.",
} as const;

if (import.meta.main) {
	const app = RudelDesktopApp({ localEngine: tauriLocalEngine });
	console.log("Rudel Tauri shell scaffold ready.");
	console.log(desktopShellScope.rule);
	console.log(app.product);
}
