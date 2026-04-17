import { Agentation } from "agentation";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/clipboard";

async function handleCopy(markdown: string) {
	const copied = await copyTextToClipboard(markdown);

	if (!copied) {
		toast.error(
			"Agentation could not copy feedback. Check clipboard permission and use localhost or HTTPS.",
		);
	}
}

export function DevTools() {
	return <Agentation copyToClipboard={false} onCopy={handleCopy} />;
}
