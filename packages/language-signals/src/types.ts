export type LanguageSignalCategory =
	| "negative"
	| "swear"
	| "apology"
	| "positive";

export interface LanguageSignalMatch {
	readonly category: LanguageSignalCategory;
	readonly ruleId: string;
	readonly matchedText: string;
	readonly start: number;
	readonly end: number;
}

export type DisplayTextPart =
	| { readonly type: "text"; readonly content: string }
	| { readonly type: "strong"; readonly content: string }
	| { readonly type: "inline-code"; readonly content: string }
	| {
			readonly type: "fenced-code";
			readonly content: string;
			readonly language: string;
	  }
	| {
			readonly type: "xml";
			readonly content: string;
			readonly tag: string;
	  };
