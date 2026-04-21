export const STEP_QUERY_PARAM = "step";
export const STEP_PREVIEW_QUERY_PARAM_PREFIX = "preview-";

export const UPLOAD_STEP = {
	id: "upload",
	label: "Upload",
	kind: "placeholder",
} as const;

export const WRAPPED_STEPS = [
	{ id: "intro", label: "Intro", kind: "placeholder" },
	{ id: "skills", label: "Skills", kind: "placeholder" },
	{ id: "tools", label: "Tools", kind: "placeholder" },
	{ id: "model", label: "Model", kind: "placeholder" },
	{ id: "scale", label: "Scale", kind: "placeholder" },
	{ id: "lock-in", label: "Lock-in", kind: "placeholder" },
	{ id: "quality", label: "Quality", kind: "placeholder" },
	{ id: "pulse", label: "Repo pulse", kind: "placeholder" },
	{ id: "card", label: "Final card", kind: "final" },
] as const;

export type WrappedPrimaryStep = (typeof WRAPPED_STEPS)[number];
export type WrappedStep = typeof UPLOAD_STEP | WrappedPrimaryStep;
export type WrappedStepId = WrappedStep["id"];
export type PreviewableWrappedStepId = Exclude<WrappedStepId, "card">;

export interface WrappedPreviewOption {
	label: string;
	value: string;
}

export interface WrappedBeatContract {
	metricBasis: string;
	timeWindow: string;
	referenceClass: string;
	eligibility: string;
}

export const WRAPPED_BEAT_CONTRACTS: Record<WrappedStepId, WrappedBeatContract> =
	{
		upload: {
			metricBasis:
				"Temporary pre-recap beat. Final live version should read from upload job status and uploaded export summary.",
			timeWindow: "Current upload attempt.",
			referenceClass: "Current user's uploaded session exports.",
			eligibility: "Always shown before the intro beat.",
		},
		intro: {
			metricBasis: "Count of session_analytics rows for this user.",
			timeWindow: "All time since first session.",
			referenceClass: "User's own history.",
			eligibility: "Always shown. Copy softens when total_sessions < 10.",
		},
		skills: {
			metricBasis: "Top 3 skills by usage count plus skills_adoption_rate.",
			timeWindow: "Developer analytics window (last 90 days).",
			referenceClass: "User's own history.",
			eligibility: "At least one ranked skill or adoption rate recorded.",
		},
		tools: {
			metricBasis: "Top slash command and top subagent by usage.",
			timeWindow: "Developer analytics window (last 90 days).",
			referenceClass: "User's own history.",
			eligibility: "At least one slash command or subagent recorded.",
		},
		model: {
			metricBasis:
				"Claude vs Codex session share across the full run, plus a month-by-month split for the latest 6 months.",
			timeWindow:
				"Top bar is all time. Monthly stacks cover the latest 6-month window.",
			referenceClass: "User's own history.",
			eligibility:
				"At least one wrapped source_split row or one model_by_month row. Monthly share falls back gracefully when fewer than 6 months are present.",
		},
		scale: {
			metricBasis: "Sum of input_tokens + output_tokens across sessions.",
			timeWindow: "All time since first session.",
			referenceClass:
				"Reading-length anchors (essay, novella, novel, War and Peace).",
			eligibility: "total_tokens > 0.",
		},
		"lock-in": {
			metricBasis:
				"Longest recorded session duration compared to the average session duration, with overrun and ratio derived from those two values.",
			timeWindow:
				"Longest session across all time. Average over developer analytics window.",
			referenceClass: "User's own session distribution.",
			eligibility:
				"Any recorded session duration. Copy softens when longest_session_min < 30 or avg_session_duration_min is missing.",
		},
		quality: {
			metricBasis: "Commit rate and success_rate.",
			timeWindow: "Developer analytics window.",
			referenceClass: "User's own history.",
			eligibility: "At least one of commit_rate or success_rate is available.",
		},
		pulse: {
			metricBasis:
				"Top repos by session count, with each repo labeled by the strongest work signal inside it: tool adoption, depth, token load, or delivery.",
			timeWindow: "Developer analytics window.",
			referenceClass: "User's own repositories.",
			eligibility:
				"At least one recorded session with a project path before the final card reveal.",
		},
		card: {
			metricBasis:
				"User-picked archetype theme. Classifier lands later; no automatic assignment yet.",
			timeWindow: "Snapshot of the current card stats at view time.",
			referenceClass: "User browses the full archetype set.",
			eligibility: "Always shown.",
		},
	};

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
