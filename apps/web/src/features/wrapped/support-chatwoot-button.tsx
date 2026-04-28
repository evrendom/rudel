import { HelpCircle, X } from "lucide-react";
import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { closeChatwoot, openChatwoot } from "@/lib/chatwoot";

const CHATWOOT_OPENED_EVENT = "chatwoot:opened";
const CHATWOOT_CLOSED_EVENT = "chatwoot:closed";

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
			setIsChatwootOpen(false);
			await closeChatwoot();
			return;
		}

		setIsChatwootOpen(true);
		await openChatwoot();
	}

	return (
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
}
