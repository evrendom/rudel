import type { WrappedTeamMemberCardTheme } from "./card";

export type WrappedProductArchetypeId =
	| "roadrunner"
	| "hit_and_runner"
	| "adhd_brain"
	| "cheapskate"
	| "company_card"
	| "tourist"
	| "smooth_operator"
	| "obsessed"
	| "maniac";

interface WrappedArchetypeCardThemeBase {
	displayLabel: string;
	shellClassName: string;
	theme: WrappedTeamMemberCardTheme;
}

export interface WrappedProductArchetypeCardTheme
	extends WrappedArchetypeCardThemeBase {
	classifierKey: WrappedProductArchetypeId;
	id: WrappedProductArchetypeId;
	kind: "taxonomy";
}

export interface WrappedSpecialEditionCardTheme
	extends WrappedArchetypeCardThemeBase {
	classifierKey: undefined;
	id: string;
	kind: "special_edition";
}

export type WrappedArchetypeCardTheme =
	| WrappedProductArchetypeCardTheme
	| WrappedSpecialEditionCardTheme;

const WRAPPED_SHELL_BACKGROUND_VALUE_PATTERN = /bg-\[(.+?)\]/;

// The product archetype catalog. Classifier keys, local ids, docs, and labels
// intentionally use the same current product names so older names cannot leak
// into dev simulations or user-visible card copy.
export const WRAPPED_ARCHETYPE_CARD_THEMES = [
	{
		classifierKey: "roadrunner",
		displayLabel: "Roadrunner",
		id: "roadrunner",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
		theme: "light",
	},
	{
		classifierKey: "hit_and_runner",
		displayLabel: "Hit and Runner",
		id: "hit_and_runner",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#EE9BEB_0%,_#F29BBB_44.71%,_#EFB09C_100%)]",
		theme: "light",
	},
	{
		classifierKey: "adhd_brain",
		displayLabel: "ADHD Brain",
		id: "adhd_brain",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#FF7567_0%,_#F8D558_48.08%,_#A4F554_100%)]",
		theme: "light",
	},
	{
		classifierKey: "cheapskate",
		displayLabel: "Cheapskate",
		id: "cheapskate",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#00E4E7_0%,_#00EAAE_100%)]",
		theme: "light",
	},
	{
		classifierKey: "company_card",
		displayLabel: "Company Card",
		id: "company_card",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#E5F221_0%,_#DFEC1C_100%)]",
		theme: "light",
	},
	{
		classifierKey: undefined,
		displayLabel: "Decimal",
		id: "decimal",
		kind: "special_edition",
		shellClassName:
			"bg-[linear-gradient(180deg,_#F7E08B_0%,_#D4AF37_42%,_#9C7415_100%)]",
		theme: "light",
	},
	{
		classifierKey: "tourist",
		displayLabel: "Tourist",
		id: "tourist",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#39E5E7_0%,_#35E895_50.96%,_#7AE762_100%)]",
		theme: "light",
	},
	{
		classifierKey: "smooth_operator",
		displayLabel: "Smooth Operator",
		id: "smooth_operator",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#8ED9F8_0%,_#69B8D9_100%)]",
		theme: "light",
	},
	{
		classifierKey: "obsessed",
		displayLabel: "Obsessed",
		id: "obsessed",
		kind: "taxonomy",
		shellClassName:
			"border-white/10 bg-[linear-gradient(180deg,_#191919_0%,_#000000_100%)]",
		theme: "dark",
	},
	{
		classifierKey: "maniac",
		displayLabel: "Maniac",
		id: "maniac",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#F05267_0%,_#F05267_50%,_#F8D558_100%)]",
		theme: "light",
	},
] as const satisfies readonly WrappedArchetypeCardTheme[];

export const WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES =
	WRAPPED_ARCHETYPE_CARD_THEMES.filter(isWrappedProductArchetypeCardTheme);

export function getWrappedArchetypeCardBackgroundValue(
	theme: WrappedArchetypeCardTheme,
) {
	const backgroundMatch = theme.shellClassName.match(
		WRAPPED_SHELL_BACKGROUND_VALUE_PATTERN,
	);

	return backgroundMatch?.[1].replaceAll("_", " ") ?? null;
}

export function resolveWrappedArchetypeCardThemeByClassifierKey(
	classifierKey: string | undefined,
) {
	if (!classifierKey) {
		return undefined;
	}

	return WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES.find(
		(theme) => theme.classifierKey === classifierKey,
	);
}

function isWrappedProductArchetypeCardTheme(
	theme: WrappedArchetypeCardTheme,
): theme is WrappedProductArchetypeCardTheme {
	return theme.kind === "taxonomy";
}
