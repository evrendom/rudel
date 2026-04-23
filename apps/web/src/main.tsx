import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/app/providers/AppProviders";
import App from "./App.tsx";
import { useMountEffect } from "./app/hooks/useMountEffect";
import "./index.css";
import { initProductAnalytics } from "./lib/product-analytics";

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
		<AppProviders>
			<GlobalLumaScope />
			<div className="h-full">
				<App />
				{DevTools ? (
					<Suspense fallback={null}>
						<DevTools />
					</Suspense>
				) : null}
			</div>
		</AppProviders>
	</StrictMode>,
);

deferProductAnalyticsInit();
