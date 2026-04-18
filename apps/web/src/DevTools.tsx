import { Agentation } from "agentation";
import { toast } from "sonner";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";

async function handleCopy(markdown: string) {
	const result = await copyTextToClipboardWithResult(markdown, {
		preferSelectionCopy: true,
		allowPromptFallback: true,
		promptMessage: "Copy Agentation feedback: Cmd/Ctrl+C, Enter",
	});

	if (result === "failed") {
		toast.error(
			"Agentation could not copy feedback. Check clipboard permission and use localhost or HTTPS.",
		);
	}

	if (result === "prompted") {
		toast.info("Agentation opened a manual copy prompt.");
	}
}

export function DevTools() {
	return <Agentation copyToClipboard={false} onCopy={handleCopy} />;
}
