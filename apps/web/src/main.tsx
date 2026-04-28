import { DialRoot } from "dialkit";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { useLocation } from "react-router-dom";
import { AppProviders } from "@/app/providers/AppProviders";
import App from "./App.tsx";
import { useIsMobile } from "./app/hooks/use-mobile";
import { useMountEffect } from "./app/hooks/useMountEffect";
import "./index.css";
import "dialkit/styles.css";
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

function DevControls() {
	const { pathname } = useLocation();
	const isMobile = useIsMobile();
	const isWrappedMobile = isMobile && pathname.startsWith("/wrapped");

	if (isWrappedMobile) {
		return null;
	}

	return (
		<>
			<DialRoot defaultOpen={false} position="bottom-right" />
			{DevTools ? (
				<Suspense fallback={null}>
					<DevTools />
				</Suspense>
			) : null}
		</>
	);
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
				{import.meta.env.DEV ? <DevControls /> : null}
			</div>
		</AppProviders>
	</StrictMode>,
);

deferProductAnalyticsInit();
