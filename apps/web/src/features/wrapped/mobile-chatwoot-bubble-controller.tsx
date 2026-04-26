import { MOBILE_QUERY } from "@/app/hooks/use-mobile";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { setChatwootBubbleVisibility } from "@/lib/chatwoot";

export function WrappedMobileChatwootBubbleController() {
	useMountEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}

		const mediaQuery = window.matchMedia(MOBILE_QUERY);

		function syncBubbleVisibility() {
			void setChatwootBubbleVisibility(mediaQuery.matches ? "hide" : "show");
		}

		syncBubbleVisibility();
		mediaQuery.addEventListener("change", syncBubbleVisibility);

		return () => {
			mediaQuery.removeEventListener("change", syncBubbleVisibility);
			void setChatwootBubbleVisibility("show");
		};
	});

	return null;
}
