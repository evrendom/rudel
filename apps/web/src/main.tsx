import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/app/providers/AppProviders";
import App from "./App.tsx";
import "./index.css";
import { initProductAnalytics } from "./lib/product-analytics";

function deferProductAnalyticsInit() {
	if (typeof window === "undefined") {
		return;
	}

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(() => {
			initProductAnalytics();
		});
		return;
	}

	setTimeout(() => {
		initProductAnalytics();
	}, 0);
}

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AppProviders>
			<App />
		</AppProviders>
	</StrictMode>,
);

deferProductAnalyticsInit();
