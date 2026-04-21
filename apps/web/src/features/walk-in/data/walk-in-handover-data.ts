import { WalkInHandoverSchema } from "@/features/walk-in/lib/walk-in-handover-schema";

export const walkInHandoverData = WalkInHandoverSchema.parse({
	version: "1",
	preview: {
		title: "Your Claude Code / Codex Wrapped",
		description:
			"A trading-card view of how you actually use Claude Code and Codex, shaped for screenshots instead of dashboards.",
		termsLabel: "8 verified metrics",
		hud: {
			title: "Metric HUD",
			description: "Candidate stats to pull into the wrapped story.",
		},
		canvas: {
			aspectRatioLabel: "9:16",
			maxPreviewWidthPx: 440,
			backgroundHex: "#FFFFFF",
			cornerRadiusPx: 20,
		},
		profile: {
			avatarSrc: "/walk-in-profile.png",
			fallbackLabel: "User",
		},
		callToActions: [
			{
				id: "share-x",
				label: "Share on X",
				kind: "share-x",
			},
			{
				id: "share-linkedin",
				label: "Share on LinkedIn",
				kind: "share-linkedin",
			},
			{
				id: "follow-x",
				label: "Follow me on X",
				kind: "follow-x",
			},
		],
		// Reminder: these still need real storage before the inline red walk-in
		// copy warnings can be removed:
		// - user timezone / locale
		// - walk-in onboarding state
		// - persisted user-level wrapped archetype
		// - context window capacity metadata
		metricCandidates: [
			{
				id: "favorite-time-to-claude-codex",
				label: "Favorite time to Claude / Codex",
				status: "planned",
				owner: "product",
				notes: "Need a clear definition for local time bucketing.",
			},
			{
				id: "days-since-first-use",
				label: "Days since first Claude / Codex use",
				status: "available",
				owner: "data",
				notes:
					"Can be computed from the earliest qualifying session timestamp.",
			},
			{
				id: "favorite-model",
				label: "Favorite model",
				status: "planned",
				owner: "data",
				notes: "Requires normalized model names across providers.",
			},
			{
				id: "favorite-word",
				label: "Favorite word",
				status: "blocked",
				owner: "data",
				notes: "Needs a tokenization rule and stop-word filtering decision.",
			},
			{
				id: "message-count",
				label: "Message count",
				status: "available",
				owner: "data",
				notes:
					"Straight aggregation once the included message types are agreed.",
			},
			{
				id: "apology-count",
				label: "Apology count",
				status: "planned",
				owner: "data",
				notes: "Needs a phrase list for matching sorry-style responses.",
			},
			{
				id: "swear-word-count",
				label: "Swear word count",
				status: "blocked",
				owner: "product",
				notes: "Policy and moderation rules need to be decided first.",
			},
			{
				id: "total-tokens",
				label: "Total tokens",
				status: "available",
				owner: "data",
				notes:
					"Should separate prompt, completion, and cached tokens if possible.",
			},
			{
				id: "total-spend",
				label: "Total spend",
				status: "planned",
				owner: "data",
				notes:
					"Depends on cost normalization across model versions and providers.",
			},
			{
				id: "skills-used",
				label: "Skills used",
				status: "planned",
				owner: "data",
				notes: "Requires an agreed source for skill invocation events.",
			},
			{
				id: "average-context-window-percent",
				label: "Average context window %",
				status: "blocked",
				owner: "render",
				notes: "Need a decision on how to visualize and round the number.",
			},
			{
				id: "favorite-time",
				label: "Favorite time",
				status: "planned",
				owner: "product",
				notes: "Potentially redundant with favorite time to Claude / Codex.",
			},
			{
				id: "favorite-day",
				label: "Favorite day",
				status: "available",
				owner: "data",
				notes: "Computed from the local day-of-week of qualifying sessions.",
			},
			{
				id: "longest-conversation-session",
				label: "Longest conversation in a session",
				status: "planned",
				owner: "data",
				notes: "Needs a stable definition for a session boundary.",
			},
			{
				id: "repository-count",
				label: "Repository count",
				status: "planned",
				owner: "data",
				notes: "Define whether forks and archived repos count.",
			},
		],
	},
	renderPlan: {
		strategy: "remotion-compatible",
		storyBeats: [
			{
				id: "cover",
				title: "Cover",
				goal: "Introduce the person as the hero and make the first frame feel screenshot-safe.",
			},
			{
				id: "origin-myth",
				title: "Origin Myth",
				goal: "Turn the first recorded session into the opening historical reveal.",
			},
			{
				id: "work-rate",
				title: "Work Rate",
				goal: "Frame total sessions and active days as identity through repetition and consistency.",
			},
			{
				id: "model-type",
				title: "Model Type",
				goal: "Turn favorite model usage into an immediate taste and identity signal.",
			},
			{
				id: "source-archetype",
				title: "Source Archetype",
				goal: "Compress the Claude vs Codex split into a label people want to compare and repost.",
			},
			{
				id: "token-flex",
				title: "Token Flex",
				goal: "Use total tokens as the large dramatic number in the sequence.",
			},
			{
				id: "lock-in",
				title: "Lock-In",
				goal: "Give the story one honest, slightly embarrassing session-length confession card.",
			},
			{
				id: "spend-reveal",
				title: "Spend Reveal",
				goal: "End the stat run with estimated spend as a compare-ready number.",
			},
			{
				id: "share-card",
				title: "Share Card",
				goal: "Collapse the strongest identity label and the key stats into the exportable final frame.",
			},
		],
		targets: [
			{
				kind: "preview",
				id: "web-preview",
				width: 495,
				height: 880,
			},
			{
				kind: "image",
				id: "share-card",
				width: 1080,
				height: 1920,
			},
			{
				kind: "video",
				id: "story-video",
				width: 1080,
				height: 1920,
				fps: 30,
			},
		],
		handoffGoals: [
			"Keep the browser preview consuming a stable schema while the real metrics are still mocked or partially live.",
			"Make each story beat work as an individual screenshot, not just as part of the full sequence.",
			"Make the final story frames deterministic so the render owner can reproduce them in Remotion or another export pipeline.",
			"Treat data aggregation as an adapter layer that outputs this shape instead of coupling analytics queries to the UI.",
		],
	},
	wrapped: {
		data: null,
		state: "seed",
	},
});
