import { useMountEffect } from "@/app/hooks/useMountEffect";
import { setChatwootBubbleVisibility } from "@/lib/chatwoot";

export function WrappedMobileChatwootBubbleController() {
	useMountEffect(() => {
		void setChatwootBubbleVisibility("hide");

		return () => {
			void setChatwootBubbleVisibility("show");
		};
	});

	return null;
}
