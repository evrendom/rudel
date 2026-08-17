export type CodeHighlightTheme = "dark" | "light";

export type PreparedCodeToken = {
	color: string | undefined;
	content: string;
	fontStyle: number | undefined;
	offset: number;
};

export type PreparedCodeHighlight = {
	charCount: number;
	durationMs: number;
	key: string;
	language: string;
	lines: readonly (readonly PreparedCodeToken[])[];
};

export type CodeHighlightRequest = {
	code: string;
	key: string;
	language: string;
	theme: CodeHighlightTheme;
};

export type CodeHighlightResponse = PreparedCodeHighlight;
