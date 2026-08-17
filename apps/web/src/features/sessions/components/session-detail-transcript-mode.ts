let warnedAboutLegacyTranscript = false;

export function shouldUseVirtualSessionTranscript(value: string | null) {
	if (value === "legacy" && !warnedAboutLegacyTranscript) {
		warnedAboutLegacyTranscript = true;
		console.warn(
			"[SessionDetailView] ?transcript=legacy is deprecated; the windowed virtual transcript is now the only renderer.",
		);
	}
	return true;
}
