import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { cn } from "@/lib/utils";

const STEP_QUERY_PARAM = "step";

const WALK_IN_STEPS = [
	{
		id: "gate",
		label: "Gate",
		kind: "placeholder",
	},
	{
		id: "intro",
		label: "Intro",
		kind: "placeholder",
	},
	{
		id: "origin",
		label: "Origin",
		kind: "placeholder",
	},
	{
		id: "presence",
		label: "Presence",
		kind: "placeholder",
	},
	{
		id: "model",
		label: "Model",
		kind: "placeholder",
	},
	{
		id: "evolution",
		label: "Evolution",
		kind: "placeholder",
	},
	{
		id: "scale",
		label: "Scale",
		kind: "placeholder",
	},
	{
		id: "lock-in",
		label: "Lock-in",
		kind: "placeholder",
	},
	{
		id: "spend",
		label: "Spend",
		kind: "placeholder",
	},
	{
		id: "archetype",
		label: "Archetype",
		kind: "placeholder",
	},
	{
		id: "card",
		label: "Final card",
		kind: "final",
	},
] as const;

type WalkInStep = (typeof WALK_IN_STEPS)[number];

export interface TeamCardWalkInOnboardingProps {
	distinctProjectCount: number;
	displayName: string;
	finalStage: ReactNode;
	totalSessions: number;
}

export function TeamCardWalkInOnboarding(props: TeamCardWalkInOnboardingProps) {
	const { distinctProjectCount, displayName, finalStage, totalSessions } =
		props;
	const [searchParams, setSearchParams] = useSearchParams();
	const activeStepIndex = resolveActiveStepIndex(
		searchParams.get(STEP_QUERY_PARAM),
	);
	const activeStep = WALK_IN_STEPS[activeStepIndex] ?? WALK_IN_STEPS[0];

	function goToStep(nextStepIndex: number) {
		const boundedStepIndex = Math.max(
			0,
			Math.min(nextStepIndex, WALK_IN_STEPS.length - 1),
		);
		const nextStep = WALK_IN_STEPS[boundedStepIndex];

		if (!nextStep) {
			return;
		}

		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);

				if (boundedStepIndex === 0) {
					nextSearchParams.delete(STEP_QUERY_PARAM);
				} else {
					nextSearchParams.set(STEP_QUERY_PARAM, nextStep.id);
				}

				return nextSearchParams;
			},
			{ replace: true },
		);
	}

	return (
		<main className="mymind-walk-in-route min-h-screen">
			<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 text-foreground sm:px-8 lg:px-12">
				<header className="flex items-center justify-center gap-1.5">
					{WALK_IN_STEPS.map((step, stepIndex) => (
						<button
							key={step.id}
							type="button"
							aria-label={`Go to ${step.label}`}
							className={cn(
								"size-8 rounded-full border text-[0.72rem] font-medium tabular-nums transition-colors",
								stepIndex === activeStepIndex
									? "border-foreground bg-foreground text-background"
									: "border-border bg-background text-muted-foreground hover:text-foreground",
							)}
							onClick={() => goToStep(stepIndex)}
						>
							{stepIndex + 1}
						</button>
					))}
				</header>

				<div className="flex flex-1 py-8">
					{activeStep?.kind === "final" ? (
						<div className="flex w-full flex-1">{finalStage}</div>
					) : (
						<div className="w-full space-y-8">
							<PlaceholderStage
								distinctProjectCount={distinctProjectCount}
								displayName={displayName}
								step={activeStep}
								totalSessions={totalSessions}
							/>
						</div>
					)}
				</div>

				<footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
					<button
						type="button"
						disabled={activeStepIndex === 0}
						onClick={() => goToStep(activeStepIndex - 1)}
						className={cn(
							buttonVariants({ size: "lg", variant: "outline" }),
							"rounded-full",
						)}
					>
						<ChevronLeft className="size-4" />
						Previous
					</button>

					{activeStep?.kind === "final" ? (
						<Link
							to={appRoutes.dashboard()}
							className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
						>
							Done
						</Link>
					) : (
						<button
							type="button"
							onClick={() => goToStep(activeStepIndex + 1)}
							className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
						>
							Next
							<ChevronRight className="size-4" />
						</button>
					)}
				</footer>
			</div>
		</main>
	);
}

function PlaceholderStage(props: {
	distinctProjectCount: number;
	displayName: string;
	step: WalkInStep;
	totalSessions: number;
}) {
	const { distinctProjectCount, displayName, step, totalSessions } = props;
	const content = buildStepContent({
		distinctProjectCount,
		displayName,
		stepId: step.id,
		totalSessions,
	});

	return (
		<section className="flex w-full flex-1 items-center justify-center">
			<div className="w-full max-w-3xl space-y-3">
				{content.map((line) => (
					<p key={line}>{line}</p>
				))}
			</div>
		</section>
	);
}

function buildStepContent(input: {
	distinctProjectCount: number;
	displayName: string;
	stepId: WalkInStep["id"];
	totalSessions: number;
}) {
	const { distinctProjectCount, displayName, stepId, totalSessions } = input;

	switch (stepId) {
		case "gate":
			return [
				`Gate. Pre-story. Not counted in the progress indicator.`,
				`Headline: We analyzed ${totalSessions.toLocaleString()} sessions across ${distinctProjectCount.toLocaleString()} repos.`,
				`Subline: Want to pull in more before we start?`,
				`Primary action: Yes, add more.`,
				`Secondary action: Start with what I have.`,
				`Tone: self-aware, quiet.`,
				`Metric shown: total_sessions and distinct_projects.`,
				`Visual: typography only. Two numbers inline in the headline. No chart.`,
				`Fallback when total_sessions < 20: We found ${totalSessions.toLocaleString()} sessions across ${distinctProjectCount.toLocaleString()} repos. That's a start. Add more to get the real picture?`,
				`Fallback when total_sessions = 0: do not show the gate or the deck. Route to upload flow instead.`,
				`Rules: once the user picks an action, the gate does not reappear. Start with what I have is not a lesser choice. No archetype preview. No reward dangling.`,
			];
		case "intro":
			return [
				`Intro. Story card 1 of 7.`,
				`Headline: ${totalSessions.toLocaleString()} sessions later.`,
				`Subline: Here's what actually happened.`,
				`Tone: self-aware.`,
				`Metric: total_sessions.`,
				`Visual: typography only. The number large, subtitle small. Dark background. Single accent color on the number. No chart.`,
				`Fallback when total_sessions < 10: A few sessions in. Early days. Here's the shape so far.`,
				`Purpose: the opening line of the story. The gate stated the number neutrally. Intro restates it with weight.`,
			];
		case "origin":
			return [
				`Origin. Story card 2 of 7.`,
				`Headline: It started in {month_name}.`,
				`Subline: Back when you didn't know what you were doing yet.`,
				`Tone: self-aware.`,
				`Metric: first_session_at to month name.`,
				`Visual: timeline ribbon. A horizontal line from first_session_at to today, with a single marker at the start point labeled with the month.`,
				`Fallback when first session is less than 30 days ago: You started this month. Still warm. Here's what it looks like already.`,
				`Purpose: nostalgia as character arc. You didn't know what you were doing yet implies you do now.`,
			];
		case "presence":
			return [
				`Presence. Story card 3 of 7.`,
				`Headline: {active_days} out of the last {days_since_first} days.`,
				`Subline changes by ratio.`,
				`ratio >= 0.6: You kept coming back.`,
				`ratio 0.25 to 0.6: You came back when it mattered.`,
				`ratio < 0.25: You meant to do this more.`,
				`Tone: self-aware.`,
				`Metric: active_days divided by days_since_first.`,
				`Visual: dot grid. One dot per day since first_session. Active days filled. Inactive dimmed.`,
				`Fallback: if days_since_first is less than 14, skip this card.`,
				`Purpose: turns a statistic into a picture of a life.`,
			];
		case "model":
			return [
				`Model. Story card 4 of 7.`,
				`Headline: You had a type.`,
				`Subline: {favorite_model} was the one you reached for.`,
				`Tone: self-aware.`,
				`Metric: favorite_model and model usage distribution.`,
				`Visual: horizontal bar. Dominant model emphasized in full color. Other models dimmed and smaller. Not a pie chart.`,
				`Fallback when no dominant model and the top model is below 40 percent of sessions: headline becomes You didn't pick a favorite. Subline becomes You used {claude_pct}% Claude and {codex_pct}% Codex. Visual becomes a two-bar horizontal stack with equal weight.`,
				`Purpose: preference as identity.`,
			];
		case "evolution":
			return [
				`Evolution. Conditional story card 5 of 7 if shown.`,
				`Metric: top_model_per_month.`,
				`Visual: monthly ribbon. Horizontal strip divided into equal segments, one per month. Each segment colored by that month's top model. Month labels below. Model legend inline. No axes or gridlines.`,
				`Show this card only if there are at least 2 distinct top models across months, at least one month over month transition, and at least 3 months of history.`,
				`Otherwise skip this card because the Model card already tells the story.`,
				`Headline and subline variant: You tried a few things. Then {current_favorite} stuck.`,
				`Headline and subline variant: Something changed in {switch_month}. That's when {new_model} became the one.`,
				`Headline and subline variant: You kept exploring. No single model won the whole season.`,
				`Headline and subline variant: You had a favorite. But you tried things. {favorite_model}, mostly. {other_models} when the mood struck.`,
				`Purpose: progression. Reveals how the preference formed. Only earns a slot when the data has a story.`,
			];
		case "scale":
			return [
				`Scale. Story card 5 or 6 of 7.`,
				`Headline: {total_tokens_formatted} tokens.`,
				`Subline changes by scale anchor.`,
				`If total_tokens is above 10M: Roughly War and Peace. {n} times over.`,
				`If total_tokens is between 1M and 10M: About {n} novels' worth.`,
				`If total_tokens is between 100k and 1M: Somewhere around a novella.`,
				`If total_tokens is below 100k: Enough to fill a long essay.`,
				`Tone: flex.`,
				`Metric: total_tokens.`,
				`Visual: anchor comparison. For the War and Peace variant use a grid of small book icons or a progress bar labeled 1 War and Peace with overflow past it.`,
				`Fallback: if total_tokens is 0 or missing, skip this card.`,
				`Purpose: the big-number flex, made physical.`,
			];
		case "lock-in":
			return [
				`Lock-in. Story card 6 or 7 of 7.`,
				`Headline: Your longest session lasted {longest_session_formatted}.`,
				`Subline changes by comparison against average session length.`,
				`If longest is more than 4 times average: Most sessions end. That one didn't.`,
				`If longest is 2 to 4 times average: One session got away from you.`,
				`If longest is below 2 times average: You close the tab when you're done.`,
				`Tone: self-aware.`,
				`Metric: longest_session_min and avg_session_min.`,
				`Visual: two bars on the same scale. Average session small. Longest session large. No axes. No gridlines.`,
				`Fallback: if longest_session_min is below 30, skip this card.`,
				`Purpose: the confession and the evidence.`,
			];
		case "spend":
			return [
				`Spend. Story card 7 of 7.`,
				`Headline: {estimated_spend_usd} across {total_sessions} sessions.`,
				`Subline: About {cents_per_session} cents each.`,
				`Tone: dry.`,
				`Metric: estimated_spend_usd divided by total_sessions.`,
				`Visual: typography only. Total spend large. Per-session cost smaller beneath it. No chart.`,
				`Fallback when spend is below 1 dollar: Under a dollar so far. The numbers haven't caught up with you yet.`,
				`Purpose: transition beat between the flex and the verdict. Reframes cost as efficiency.`,
			];
		case "archetype":
			return [
				`Archetype. Destination. Not counted in the progress indicator.`,
				`Headline: You're {the_archetype}.`,
				`Subline: the single sentence written for this archetype.`,
				`Tone: serious.`,
				`Metric: assigned archetype label and its subtitle.`,
				`Visual: archetype portrait composition. Each archetype gets a visual identity. The archetype hue appears here for the first time.`,
				`Design direction example: Marathoner is a long horizontal line extending past the frame. Ritualist is a repeating geometric pattern. Machine is a dense grid. Binger is scattered clusters with empty space between.`,
				`Share affordances appear on this card only. This generates a clean 1:1 and 9:16 composition with the archetype visual, label, and 3 to 4 key stats.`,
				`Fallback: no fallback. Every user gets an archetype. If the classifier errors, default to the neutral middle archetype subtitle.`,
				`Purpose: the thesis. Every preceding card is evidence for this verdict.`,
				`Note for ${displayName}: this is the end of the intended story arc before the current card page.`,
			];
		default:
			return [`No scaffold content for this step yet.`];
	}
}

function resolveActiveStepIndex(stepId: string | null) {
	if (!stepId) {
		return 0;
	}

	const resolvedStepIndex = WALK_IN_STEPS.findIndex(
		(step) => step.id === stepId,
	);
	return resolvedStepIndex >= 0 ? resolvedStepIndex : 0;
}
