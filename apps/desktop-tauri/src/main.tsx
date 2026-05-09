import { RudelDesktopApp } from "@rudel/desktop-ui";
import { StrictMode } from "react";
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

createRoot(rootElement).render(
	<StrictMode>
		<RudelDesktopApp localEngine={tauriLocalEngine} />
	</StrictMode>,
);
