import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { useMountEffect } from "./app/hooks/useMountEffect";
import "./index.css";
import { initProductAnalytics } from "./lib/product-analytics";
import { queryClient } from "./lib/query-client";
import { ThemeProvider } from "./app/providers/ThemeProvider";

const DevTools = import.meta.env.DEV
	? lazy(async () => {
			const module = await import("./DevTools.tsx");
			return {
				default: module.DevTools,
			};
		})
	: null;

function GlobalLumaScope() {
	useMountEffect(() => {
		document.body.classList.add("style-luma");

		return () => {
			document.body.classList.remove("style-luma");
		};
	});

	return null;
}

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
					<GlobalLumaScope />
					<div className="h-full">
						<App />
						{DevTools ? (
							<Suspense fallback={null}>
								<DevTools />
							</Suspense>
						) : null}
					</div>
				</ThemeProvider>
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>,
);

deferProductAnalyticsInit();
