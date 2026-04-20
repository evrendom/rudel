import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { cn } from "@/lib/utils";

const STEP_QUERY_PARAM = "step";

const WALK_IN_STEPS = [
	{
		id: "intro",
		label: "Intro",
		kind: "placeholder",
	},
	{
		id: "what-we-found",
		label: "What we found",
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

export function TeamCardWalkInOnboarding(
	props: TeamCardWalkInOnboardingProps,
) {
	const { distinctProjectCount, displayName, finalStage, totalSessions } = props;
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
						<PlaceholderStage
							distinctProjectCount={distinctProjectCount}
							displayName={displayName}
							step={activeStep}
							totalSessions={totalSessions}
						/>
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

	return (
		<section className="flex w-full flex-1 items-center justify-center">
			<div className="w-full max-w-2xl">
				{step.id === "intro" ? (
					<>
						<p className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Hey {displayName} we analyzed {totalSessions.toLocaleString()}{" "}
							sessions across {distinctProjectCount.toLocaleString()} repos.
						</p>
						<p className="mt-6 text-lg text-muted-foreground">
							Here is what we found.
						</p>
					</>
				) : (
					<>
						<p className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Favorite model.
						</p>
						<p className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Claude vs Codex split.
						</p>
						<p className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Total tokens.
						</p>
						<p className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Longest session.
						</p>
						<p className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
							Estimated spend.
						</p>
					</>
				)}
			</div>
		</section>
	);
}

function resolveActiveStepIndex(stepId: string | null) {
	if (!stepId) {
		return 0;
	}

	const resolvedStepIndex = WALK_IN_STEPS.findIndex((step) => step.id === stepId);
	return resolvedStepIndex >= 0 ? resolvedStepIndex : 0;
}
