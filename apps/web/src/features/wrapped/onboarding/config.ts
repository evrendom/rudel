export const STEP_QUERY_PARAM = "step";
export const STEP_PREVIEW_QUERY_PARAM_PREFIX = "preview-";

export const UPLOAD_STEP = {
	id: "upload",
	label: "Upload",
	kind: "placeholder",
	phase: "setup",
} as const;

export const WRAPPED_STEPS = [
	{ id: "intro", label: "Intro", kind: "placeholder", phase: "story" },
	{ id: "skills", label: "Skills", kind: "placeholder", phase: "story" },
	{ id: "tools", label: "Tools", kind: "placeholder", phase: "story" },
	{ id: "model", label: "Model", kind: "placeholder", phase: "story" },
	{ id: "scale", label: "Scale", kind: "placeholder", phase: "story" },
	{ id: "lock-in", label: "Lock-in", kind: "placeholder", phase: "story" },
	{ id: "quality", label: "Quality", kind: "placeholder", phase: "story" },
	{ id: "pulse", label: "Repo pulse", kind: "placeholder", phase: "story" },
	{ id: "card", label: "Final card", kind: "final", phase: "reward" },
] as const;

export type WrappedPrimaryStep = (typeof WRAPPED_STEPS)[number];
export type WrappedStep = typeof UPLOAD_STEP | WrappedPrimaryStep;
export type WrappedStepId = WrappedStep["id"];
export type WrappedStepPhase = WrappedStep["phase"];
export type PreviewableWrappedStepId = Exclude<WrappedStepId, "card">;

export interface WrappedPreviewOption {
	label: string;
	value: string;
}

export type WrappedBeatReadiness =
	| "ship_now"
	| "ship_now_with_softening"
	| "needs_truth_cleanup"
	| "needs_codex_feature_parity"
	| "needs_classifier_snapshot";

export type WrappedStoryVisibility = "show_in_saturday_story" | "hide_for_now";

export interface WrappedBeatContract {
	// currentStatus is the one-line launch decision for the beat.
	currentStatus: WrappedBeatReadiness;
	// saturdayStoryVisibility answers the product question directly:
	// should this beat be in the launch story deck users actually swipe through?
	saturdayStoryVisibility: WrappedStoryVisibility;
	// whatWeShowNow is the concrete metric surface the current UI can defend.
	whatWeShowNow: readonly string[];
	metricBasis: string;
	timeWindow: string;
	referenceClass: string;
	eligibility: string;
	// infraRequirement answers "what needs MV or other backend work?" directly.
	infraRequirement: string;
	// productNote explains how product should talk about the beat right now.
	productNote: string;
}

// This contract is the Saturday wrapped truth table.
//
// It exists so product, design, and engineering can answer the same questions
// from one file:
// - which beats are safe to ship now
// - which beats need softer copy
// - which beats are blocked on classifier work, Codex feature parity, or other
//   backend truth-layer changes
//
// Rule of thumb:
// - "ship_now" means the current queries are enough
// - "ship_now_with_softening" means the beat is usable but copy should stay
//   clearly heuristic
// - "needs_truth_cleanup" means the current stage mixes windows or fuzzy metrics
// - "needs_codex_feature_parity" means Claude data is ahead of Codex data
// - "needs_classifier_snapshot" means the pipeline must land before we claim a
//   real computed archetype
//
// Separate from readiness, saturdayStoryVisibility is the launch deck switch.
// This keeps one simple product truth:
// - some beats can stay implemented for previews and future work
// - only the beats we trust enough today appear in the Saturday user story
export const WRAPPED_BEAT_CONTRACTS: Record<
	WrappedStepId,
	WrappedBeatContract
> = {
	upload: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "hide_for_now",
		whatWeShowNow: ["Upload placeholder state", "Uploading now", "Ready state"],
		metricBasis:
			"Temporary pre-recap beat. Final live version should read from upload job status and uploaded export summary.",
		timeWindow: "Current upload attempt.",
		referenceClass: "Current user's uploaded session exports.",
		eligibility: "Setup-only scaffolding. Not shown inside the story deck.",
		infraRequirement:
			"No MV required for Saturday. Replace the placeholder with real upload job state when the upload flow is finalized.",
		productNote:
			"This beat is scaffolding, not a claim about user history. Keep it in setup, not in the recap story itself.",
	},
	intro: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"Total sessions",
			"Active days",
			"Days since first session",
		],
		metricBasis:
			"Wrapped summary metrics from the current all-time wrapped endpoint, plus total_sessions from the existing page data.",
		timeWindow: "All time since first session.",
		referenceClass: "User's own history.",
		eligibility: "Always shown. Copy softens when total_sessions < 10.",
		infraRequirement:
			"No MV required. Current wrapped summary reads are enough for the intro beat.",
		productNote:
			"This is one of the safest beats. It should establish activity and history, not over-interpret behavior.",
	},
	skills: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"Top 3 recorded skills",
			"Skills adoption rate when present",
		],
		metricBasis:
			"Top 3 skills by usage count plus skills_adoption_rate from developer feature usage.",
		timeWindow: "Developer analytics window (currently last 365 days).",
		referenceClass: "User's own history.",
		eligibility: "At least one ranked skill or adoption rate recorded.",
		infraRequirement:
			"No MV is required for v1. Cross-source skills coverage is now good enough to ship as a recap beat.",
		productNote:
			"Ship this as a concrete usage recap, not as a personality claim. Let the podium stay evidence-first.",
	},
	tools: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"Top slash command",
			"Top subagent",
			"Slash/subagent adoption rates when present",
		],
		metricBasis: "Top slash command and top subagent by usage.",
		timeWindow: "Developer analytics window (currently last 365 days).",
		referenceClass: "User's own history.",
		eligibility: "At least one slash command or subagent recorded.",
		infraRequirement:
			"No MV is required for v1. Slash-command and subagent coverage is now strong enough to ship in the core story.",
		productNote:
			"Frame this as observed tool usage, not as a judgment about sophistication or workflow maturity.",
	},
	model: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"All-time Claude vs Codex session split",
			"Monthly model usage trend",
		],
		metricBasis:
			"Claude vs Codex session share across the full run, plus a month-by-month split for the latest 6 months.",
		timeWindow:
			"Top bar is all time. Monthly stacks cover the latest 6-month window.",
		referenceClass: "User's own history.",
		eligibility:
			"At least one wrapped source_split row or one model_by_month row. Monthly share falls back gracefully when fewer than 6 months are present.",
		infraRequirement:
			"No MV required for the live view. If product wants a frozen campaign artifact later, snapshot this series into the wrapped payload.",
		productNote:
			"This beat is safe as long as we present it as usage mix, not as preference psychology.",
	},
	scale: {
		currentStatus: "ship_now",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"Total tokens",
			"Reading-scale anchor",
			"Token-to-ball mapping",
		],
		metricBasis: "Sum of input_tokens + output_tokens across sessions.",
		timeWindow: "All time since first session.",
		referenceClass:
			"Reading-length anchors (essay, novella, novel, War and Peace).",
		eligibility: "total_tokens > 0.",
		infraRequirement:
			"No MV required. Current wrapped total_tokens is enough for this stage.",
		productNote:
			"This is a safe spectacle beat. It should stay anchored in countable volume, not inferred productivity.",
	},
	"lock-in": {
		currentStatus: "needs_truth_cleanup",
		saturdayStoryVisibility: "hide_for_now",
		whatWeShowNow: [
			"Longest session",
			"Average session duration",
			"Relative overrun",
		],
		metricBasis:
			"Longest recorded session duration compared to the average session duration, with overrun and ratio derived from those two values.",
		timeWindow:
			"Longest session across all time. Average over the current 365-day developer analytics window.",
		referenceClass: "User's own session distribution.",
		eligibility:
			"Any recorded session duration. Copy softens when longest_session_min < 30 or avg_session_duration_min is missing.",
		infraRequirement:
			"Needs one consistent window or a dedicated wrapped rollup. This is a truth-cleanup problem, not a special MV requirement.",
		productNote:
			"Do not present this as a crisp behavioral claim until longest and average session duration are computed from the same contract window.",
	},
	quality: {
		currentStatus: "ship_now_with_softening",
		saturdayStoryVisibility: "hide_for_now",
		whatWeShowNow: ["Commit rate", "Success rate when present"],
		metricBasis: "Commit rate and success_rate.",
		timeWindow: "Developer analytics window (currently last 365 days).",
		referenceClass: "User's own history.",
		eligibility: "At least one of commit_rate or success_rate is available.",
		infraRequirement:
			"No MV is required for v1, but success methodology still needs to stay explicitly soft until the semantics are fully settled.",
		productNote:
			"This beat can stay in the core story if the copy remains operational and avoids turning success into a moral score.",
	},
	pulse: {
		currentStatus: "ship_now_with_softening",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"Top repos by session count",
			"Heuristic repo work-type label",
			"Session and token proof text",
		],
		metricBasis:
			"Top repos by session count, with each repo labeled by the strongest work signal inside it: tool adoption, depth, token load, or delivery.",
		timeWindow: "Developer analytics window (currently last 365 days).",
		referenceClass: "User's own repositories.",
		eligibility:
			"At least one recorded session with a project path before the final card reveal.",
		infraRequirement:
			"No MV required for v1. The current developer sessions query is enough, but the repo role labels should stay explicitly heuristic.",
		productNote:
			"This beat is useful when framed as repo pulse, not as a deterministic classifier of project importance.",
	},
	card: {
		currentStatus: "needs_classifier_snapshot",
		saturdayStoryVisibility: "show_in_saturday_story",
		whatWeShowNow: [
			"User-picked theme carousel",
			"Core k9 archetype set",
			"Decimal VIP special edition",
		],
		metricBasis:
			"User-picked archetype theme. Classifier lands later; no automatic assignment yet.",
		timeWindow: "Snapshot of the current card stats at view time.",
		referenceClass: "User browses the full archetype set.",
		eligibility: "Always shown.",
		infraRequirement:
			"Needs the snapshot-based archetype pipeline from docs/archetype-clickhouse-pipeline.md. Do not replace this with an incremental MV. Decimal stays product-only even after the classifier lands.",
		productNote:
			"Today this is a theme picker, not a truth claim. The card can show Smooth Operator and other product labels, but only classifier-backed themes should ever be called computed archetypes.",
	},
};

// This is the actual Saturday launch deck.
//
// Upload now belongs to setup, so the story itself starts on intro. The deck is
// intentionally smaller than the full implementation surface. The hidden beats
// still exist for previewing and future truth work, but users only see the
// beats we trust enough to ship now.
export const WRAPPED_SATURDAY_STEPS = WRAPPED_STEPS.filter((step) =>
	isWrappedStepVisibleInSaturdayStory(step.id),
) as readonly WrappedPrimaryStep[];

export function isWrappedStepVisibleInSaturdayStory(stepId: WrappedStepId) {
	return (
		WRAPPED_BEAT_CONTRACTS[stepId].saturdayStoryVisibility ===
		"show_in_saturday_story"
	);
}

export const WRAPPED_STEP_PREVIEW_OPTIONS = {
	upload: [
		{ value: "auto", label: "Auto (placeholder)" },
		{ value: "uploading", label: "Uploading now" },
		{ value: "ready-single", label: "Ready, one export" },
		{ value: "ready-multi", label: "Ready, multiple exports" },
	],
	intro: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "sparse", label: "Sparse run" },
		{ value: "full", label: "Full run" },
	],
	skills: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "dominant", label: "Clear podium" },
		{ value: "dominant-no-rate", label: "Podium, no adoption rate" },
		{ value: "usage-no-winner", label: "Tight race" },
		{ value: "single-skill", label: "One visible skill" },
		{ value: "no-signal", label: "No skill signal" },
	],
	tools: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "both", label: "Slash + subagent" },
		{ value: "slash-only", label: "Slash only" },
		{ value: "subagent-only", label: "Subagent only" },
		{ value: "base-model", label: "No extension usage" },
	],
	model: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "favorite", label: "Clear favorite" },
		{ value: "played-field", label: "No favorite" },
		{ value: "single-switch", label: "One monthly switch" },
		{ value: "exploring", label: "Constant exploration" },
		{ value: "settled", label: "Explored, then settled" },
		{ value: "rotation", label: "Mostly one, some rotation" },
	],
	scale: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "missing", label: "No token signal" },
		{ value: "million", label: "1M tokens" },
		{ value: "essay", label: "Essay scale" },
		{ value: "novella", label: "Novella scale" },
		{ value: "novels", label: "Novel scale" },
		{ value: "war-and-peace", label: "War and Peace scale" },
	],
	"lock-in": [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "none", label: "No runaway session" },
		{ value: "stretched", label: "Stretched session" },
		{ value: "got-away", label: "Session got away" },
		{ value: "didnt-end", label: "Session never ended" },
	],
	quality: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "strong", label: "Strong finish" },
		{ value: "lands-commits-lag", label: "High success, lower commits" },
		{ value: "ship-through-mess", label: "High commits, lower success" },
		{ value: "iterate", label: "Mostly iteration" },
		{ value: "lands-only", label: "Success only" },
		{ value: "iterating-only", label: "Low success only" },
		{ value: "commit-only-high", label: "Commit rate only, high" },
		{ value: "commit-only-low", label: "Commit rate only, low" },
		{ value: "no-signal", label: "No finish signal" },
	],
	pulse: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "single-home", label: "One home repo" },
		{ value: "split-across", label: "Split across repos" },
		{ value: "quiet", label: "Low repo signal" },
	],
} as const satisfies Record<
	PreviewableWrappedStepId,
	readonly WrappedPreviewOption[]
>;
