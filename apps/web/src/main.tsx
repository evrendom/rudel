import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import { initProductAnalytics } from "./lib/product-analytics";
import { queryClient } from "./lib/query-client";
import { ThemeProvider } from "./providers/ThemeProvider";

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
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<ThemeProvider>
					<App />
				</ThemeProvider>
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>,
);

deferProductAnalyticsInit();
