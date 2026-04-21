import type { WrappedTeamMemberCardTheme } from "./card";

export interface WrappedArchetypeCardTheme {
	// id is the stable local key used by the wrapped card UI.
	id: string;
	// kind makes it explicit whether a card belongs to the core classifier-backed
	// archetype set or is a hand-picked product-only edition.
	kind: "taxonomy" | "special_edition";
	// classifierKey intentionally matches the ClickHouse archetype key from the
	// pipeline reference for taxonomy-backed cards. Special editions leave this
	// undefined on purpose because there is no classifier output behind them.
	classifierKey?: string;
	// taxonomyLabel is the canonical archetype name used in the data docs and
	// snapshot pipeline. Special editions can leave this empty because they are
	// not part of the core k9 taxonomy.
	taxonomyLabel?: string;
	// displayLabel is what the wrapped card shows to users today.
	displayLabel: string;
	shellClassName: string;
	theme: WrappedTeamMemberCardTheme;
}

// This is the Saturday wrapped card archetype catalog.
//
// Product rule:
// - keep the canonical archetype set aligned with docs/archetype-taxonomy.md
// - keep the classifier keys aligned with .context/archetype-clickhouse-reference.sql
// - allow a small number of display aliases where the card copy should read more
//   human than the raw taxonomy label
//
// This means:
// - `npc` is rendered as "Smooth Operator"
// - `papas_credit_card` is rendered as "Company Card"
// - `needs_to_touch_grass` stays keyed to the pipeline, but the visible product
//   label remains "Obsessed"
//
// Decimal stays in the carousel as a VIP special edition. It is intentionally
// separate from the classifier-backed k9 set so nobody mistakes it for a real
// archetype emitted by the pipeline.
export const WRAPPED_ARCHETYPE_CARD_THEMES = [
	// Core classifier-backed k9 set in the order we want people to browse it in
	// the final card carousel.
	{
		classifierKey: "roadrunner",
		displayLabel: "Roadrunner",
		id: "roadrunner",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
		taxonomyLabel: "Roadrunner",
		theme: "light",
	},
	{
		classifierKey: "hit_and_runner",
		displayLabel: "Hit and Runner",
		id: "hit_and_runner",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#EE9BEB_0%,_#F29BBB_44.71%,_#EFB09C_100%)]",
		taxonomyLabel: "Hit and Runner",
		theme: "light",
	},
	{
		classifierKey: "adhd_brain",
		displayLabel: "ADHD Brain",
		id: "adhd_brain",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#FF7567_0%,_#F8D558_48.08%,_#A4F554_100%)]",
		taxonomyLabel: "ADHD Brain",
		theme: "light",
	},
	{
		classifierKey: "window_shopper",
		displayLabel: "Cheapskate",
		id: "window_shopper",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#00E4E7_0%,_#00EAAE_100%)]",
		taxonomyLabel: "Cheapskate",
		theme: "light",
	},
	{
		classifierKey: "papas_credit_card",
		displayLabel: "Company Card",
		id: "papas_credit_card",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#E5F221_0%,_#DFEC1C_100%)]",
		taxonomyLabel: "Papa's Credit Card",
		theme: "light",
	},
	// Decimal is intentionally kept in the same carousel because product wants it
	// available, but `kind: "special_edition"` makes it impossible to confuse
	// this VIP card with a classifier-backed result later.
	{
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
		taxonomyLabel: "Tourist",
		theme: "light",
	},
	{
		classifierKey: "npc",
		displayLabel: "Smooth Operator",
		id: "npc",
		kind: "taxonomy",
		shellClassName: "bg-[linear-gradient(180deg,_#8ED9F8_0%,_#69B8D9_100%)]",
		taxonomyLabel: "NPC",
		theme: "light",
	},
	{
		classifierKey: "needs_to_touch_grass",
		displayLabel: "Obsessed",
		id: "needs_to_touch_grass",
		kind: "taxonomy",
		shellClassName:
			"border-white/10 bg-[linear-gradient(180deg,_#191919_0%,_#000000_100%)]",
		taxonomyLabel: "Obsessed",
		theme: "dark",
	},
	{
		classifierKey: "maniac",
		displayLabel: "Maniac",
		id: "maniac",
		kind: "taxonomy",
		shellClassName:
			"bg-[linear-gradient(180deg,_#F05267_0%,_#F05267_50%,_#F8D558_100%)]",
		taxonomyLabel: "Maniac",
		theme: "light",
	},
] as const satisfies readonly WrappedArchetypeCardTheme[];
