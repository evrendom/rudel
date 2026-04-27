import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MaintenancePage } from "@/app/system/MaintenancePage";
import "./index.css";

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<MaintenancePage />
	</StrictMode>,
);
