export type BuiltInLanguageSignalCategory =
	| "negative"
	| "swear"
	| "apology"
	| "positive";

export type LanguageSignalCategory =
	| "swear"
	| "apology"
	| "positive"
	// Keep category maps compiled by older clients forward-compatible when a
	// newer scanner adds another server-recognized category.
	| (string & {});

export interface LanguageSignalMatch {
	readonly category: BuiltInLanguageSignalCategory;
	readonly ruleId: string;
	readonly matchedText: string;
	readonly start: number;
	readonly end: number;
}

export type ModelLanguageSignalCategory = Exclude<
	BuiltInLanguageSignalCategory,
	"positive"
>;

export interface ModelLanguageSignalMatch extends LanguageSignalMatch {
	readonly category: ModelLanguageSignalCategory;
}

export interface LanguageSignalSummaryInput {
	readonly memberText: readonly string[];
	readonly modelText: readonly string[];
}

export interface LanguageSignalCounts {
	readonly member_swears: number;
	readonly member_apologies: number;
	readonly member_positive: number;
	readonly model_swears: number;
	readonly model_apologies: number;
	readonly model_positive: number;
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
