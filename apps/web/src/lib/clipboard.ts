export type ClipboardCopyResult = "copied" | "prompted" | "failed";

interface ClipboardCopyOptions {
	preferSelectionCopy?: boolean;
	allowPromptFallback?: boolean;
	promptMessage?: string;
}

function copyTextWithSelection(text: string): boolean {
	if (typeof document === "undefined") {
		return false;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.top = "0";
	textarea.style.left = "-9999px";
	textarea.style.opacity = "0";

	const selection = document.getSelection();
	const originalRange =
		selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);

	let copied = false;

	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}

	document.body.removeChild(textarea);

	if (selection) {
		selection.removeAllRanges();
		if (originalRange) {
			selection.addRange(originalRange);
		}
	}

	return copied;
}

export async function copyTextToClipboardWithResult(
	text: string,
	options: ClipboardCopyOptions = {},
): Promise<ClipboardCopyResult> {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return "failed";
	}

	const {
		preferSelectionCopy = false,
		allowPromptFallback = false,
		promptMessage = "Copy to clipboard: Cmd/Ctrl+C, Enter",
	} = options;

	if (preferSelectionCopy && copyTextWithSelection(text)) {
		return "copied";
	}

	if (
		typeof navigator !== "undefined" &&
		"clipboard" in navigator &&
		window.isSecureContext &&
		document.hasFocus()
	) {
		try {
			await navigator.clipboard.writeText(text);
			return "copied";
		} catch {
			// Fall back to selection-based copy when the async clipboard API is blocked.
		}
	}

	if (!preferSelectionCopy && copyTextWithSelection(text)) {
		return "copied";
	}

	if (allowPromptFallback && typeof window.prompt === "function") {
		window.prompt(promptMessage, text);
		return "prompted";
	}

	return "failed";
}

export async function copyTextToClipboard(
	text: string,
	options?: ClipboardCopyOptions,
): Promise<boolean> {
	const result = await copyTextToClipboardWithResult(text, options);
	return result === "copied";
}
