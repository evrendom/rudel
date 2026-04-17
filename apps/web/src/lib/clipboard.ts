export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return false;
	}

	if (
		typeof navigator !== "undefined" &&
		"clipboard" in navigator &&
		window.isSecureContext
	) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall back to selection-based copy when the async clipboard API is blocked.
		}
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
