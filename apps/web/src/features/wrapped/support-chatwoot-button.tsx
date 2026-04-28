import { HelpCircle, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useMountEffect } from "@/hooks/useMountEffect";
import {
	CHATWOOT_CLOSED_EVENT,
	CHATWOOT_OPENED_EVENT,
	closeChatwoot,
	openChatwoot,
} from "@/lib/chatwoot";

const PERSISTENT_CLOSE_CONTROL_STYLE = {
	position: "fixed",
	top: "calc(env(safe-area-inset-top, 0px) + 24px)",
	right:
		"var(--wrapped-chatwoot-right-offset, calc(env(safe-area-inset-right, 0px) + 16px))",
	zIndex: 2_147_483_647,
} satisfies CSSProperties;

export function WrappedSupportChatwootButton() {
	const [isChatwootOpen, setIsChatwootOpen] = useState(false);

	useMountEffect(() => {
		function handleChatwootOpened() {
			setIsChatwootOpen(true);
		}

		function handleChatwootClosed() {
			setIsChatwootOpen(false);
		}

		window.addEventListener(CHATWOOT_OPENED_EVENT, handleChatwootOpened);
		window.addEventListener(CHATWOOT_CLOSED_EVENT, handleChatwootClosed);

		return () => {
			window.removeEventListener(CHATWOOT_OPENED_EVENT, handleChatwootOpened);
			window.removeEventListener(CHATWOOT_CLOSED_EVENT, handleChatwootClosed);
		};
	});

	async function handleClick() {
		if (isChatwootOpen) {
			await closeChatwoot();
			return;
		}

		await openChatwoot();
	}

	const control = (
		<button
			type="button"
			aria-label={isChatwootOpen ? "Close support" : "Open support"}
			className="mymind-wrapped-top-tray__edge-control"
			onClick={() => void handleClick()}
		>
			{isChatwootOpen ? (
				<X className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--help" />
			) : (
				<HelpCircle className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--help" />
			)}
		</button>
	);

	if (!isChatwootOpen) {
		return control;
	}

	return (
		<>
			<span
				aria-hidden="true"
				className="mymind-wrapped-top-tray__utility-placeholder"
			/>
			{typeof document === "undefined"
				? null
				: createPortal(
						<button
							type="button"
							aria-label="Close support"
							className="mymind-wrapped-top-tray__edge-control"
							style={PERSISTENT_CLOSE_CONTROL_STYLE}
							onClick={() => void handleClick()}
						>
							<X className="mymind-wrapped-top-tray__edge-icon mymind-wrapped-top-tray__edge-icon--help" />
						</button>,
						document.body,
					)}
		</>
	);
}
