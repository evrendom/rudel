import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	resolveLockInPreviewInput,
	resolveLockInStageModel,
	resolveQualityPreviewInput,
	resolveQualityStageModel,
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
	resolveScalePreviewTokens,
	resolveScaleStageModel,
} from "../models";
import type { WrappedOnboardingMetrics } from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface SharedStageProps {
	displayName?: string;
	onboardingMetrics: WrappedOnboardingMetrics;
	onScaleRainRevealChange?: (isVisible: boolean) => void;
	previewState: string;
	scaleDisplayedTokens?: number;
	totalSessions?: number;
}

interface LockInMeterStyle extends CSSProperties {
	"--lock-in-stage-meter-value": string;
}

interface QualityMeterStyle extends CSSProperties {
	"--quality-stage-meter-value": string;
}

export function WrappedOnboardingScaleStage(props: SharedStageProps) {
	const {
		displayName,
		onboardingMetrics,
		onScaleRainRevealChange,
		previewState,
		scaleDisplayedTokens,
		totalSessions,
	} = props;
	const totalTokens = resolveScalePreviewTokens(
		onboardingMetrics.totalTokens,
		previewState,
	);
	const model = resolveScaleStageModel(totalTokens);
	const sessionCount = totalSessions ?? onboardingMetrics.totalSessions;

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-scale-stage"
			copy={
				<WrappedOnboardingStageCopy
					title={
						<WrappedScaleStageSequenceTitle
							displayName={displayName}
							displayTokens={scaleDisplayedTokens ?? 0}
							onRevealChange={onScaleRainRevealChange}
							totalSessions={sessionCount}
							totalTokens={model.totalTokens}
						/>
					}
					titleClassName={cn(
						"mymind-wrapped-scale-stage__headline",
						model.totalTokens > 0
							? "mymind-wrapped-scale-stage__headline--sequenced"
							: undefined,
					)}
				/>
			}
		/>
	);
}

type ScaleStageSequencePhase = "greeting" | "sessions" | "burned" | "total";

const SCALE_STAGE_SEQUENCE = [
	{ phase: "greeting", holdMs: 2_000 },
	{ phase: "sessions", holdMs: 2_000 },
	{ phase: "burned", holdMs: 2_000 },
] as const satisfies ReadonlyArray<{
	holdMs: number;
	phase: Exclude<ScaleStageSequencePhase, "total">;
}>;

const SCALE_STAGE_SEQUENCE_TRANSITION = {
	duration: 0.26,
	ease: [0.22, 1, 0.36, 1] as const,
};

function WrappedScaleStageSequenceTitle(props: {
	displayName?: string;
	displayTokens: number;
	onRevealChange?: (isVisible: boolean) => void;
	totalSessions: number;
	totalTokens: number;
}) {
	const {
		displayName,
		displayTokens,
		onRevealChange,
		totalSessions,
		totalTokens,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [phase, setPhase] = useState<ScaleStageSequencePhase>(() =>
		reduceMotion ? "total" : "greeting",
	);

	useMountEffect(() => {
		if (reduceMotion) {
			setPhase("total");
			onRevealChange?.(true);
			return;
		}

		setPhase("greeting");
		onRevealChange?.(false);
		const timeoutIds: number[] = [];
		let elapsedMs = 0;

		for (const item of SCALE_STAGE_SEQUENCE) {
			elapsedMs += item.holdMs;
			timeoutIds.push(
				window.setTimeout(() => {
					setPhase(item.phase);
				}, elapsedMs - item.holdMs),
			);
		}

		timeoutIds.push(
			window.setTimeout(() => {
				setPhase("total");
				onRevealChange?.(true);
			}, elapsedMs),
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	});

	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				key={`${phase}:${displayName ?? ""}:${totalSessions}:${totalTokens}`}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				className="mymind-wrapped-scale-stage__title-shell"
				exit={{ opacity: 0, scale: 0.985, y: -18 }}
				initial={{ opacity: 0, scale: 0.985, y: 18 }}
				transition={SCALE_STAGE_SEQUENCE_TRANSITION}
			>
				{phase === "total" ? (
					<WrappedScaleCountTitle
						displayTokens={displayTokens}
						totalTokens={totalTokens}
					/>
				) : (
					resolveScaleStageSequenceLine(phase, displayName, totalSessions)
				)}
			</motion.span>
		</AnimatePresence>
	);
}

function resolveScaleStageSequenceLine(
	phase: Exclude<ScaleStageSequencePhase, "total">,
	displayName: string | undefined,
	totalSessions: number,
) {
	if (phase === "greeting") {
		const trimmedName = displayName?.trim();
		return trimmedName ? `Hey ${trimmedName}.` : "Hey there.";
	}

	if (phase === "sessions") {
		const sessionLabel = totalSessions === 1 ? "session" : "sessions";
		return `Out of the ${totalSessions.toLocaleString("en-US")} ${sessionLabel} you uploaded...`;
	}

	return "You've burned...";
}

function WrappedScaleCountTitle(props: {
	displayTokens: number;
	totalTokens: number;
}) {
	const { displayTokens, totalTokens } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const visibleTokens = reduceMotion
		? totalTokens
		: Math.max(0, Math.min(totalTokens, displayTokens));

	return <>{visibleTokens.toLocaleString("en-US")} tokens</>;
}

export function WrappedOnboardingLockInStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveLockInStageModel(
		resolveLockInPreviewInput(
			{
				avgSessionMin: onboardingMetrics.avgSessionMin,
				longestSessionMin: onboardingMetrics.longestSessionMin,
			},
			previewState,
		),
	);
	const averageStyle: LockInMeterStyle = {
		"--lock-in-stage-meter-value": `${model.averageShare}%`,
	};
	const longestStyle: LockInMeterStyle = {
		"--lock-in-stage-meter-value": `${model.longestShare}%`,
	};

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-lock-in-stage"
			objectClassName="mymind-wrapped-lock-in-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article
					className={cn(
						"mymind-wrapped-lock-in-stage__card",
						`is-${model.state}`,
					)}
				>
					<ul className="mymind-wrapped-lock-in-stage__stats">
						<li className="mymind-wrapped-lock-in-stage__stat">
							<p className="mymind-wrapped-lock-in-stage__stat-label">
								Longest recorded
							</p>
							<p className="mymind-wrapped-lock-in-stage__stat-value">
								{model.longestDurationLabel}
							</p>
						</li>
						<li className="mymind-wrapped-lock-in-stage__stat">
							<p className="mymind-wrapped-lock-in-stage__stat-label">
								Usual session
							</p>
							<p className="mymind-wrapped-lock-in-stage__stat-value">
								{model.averageDurationLabel}
							</p>
						</li>
					</ul>

					<ul className="mymind-wrapped-lock-in-stage__chips">
						<li className="mymind-wrapped-lock-in-stage__chip is-state">
							{model.stateLabel}
						</li>
						<li className="mymind-wrapped-lock-in-stage__chip">
							{model.comparisonLabel}
						</li>
					</ul>

					<ul className="mymind-wrapped-lock-in-stage__compare">
						<li className="mymind-wrapped-lock-in-stage__row">
							<header className="mymind-wrapped-lock-in-stage__row-head">
								<p className="mymind-wrapped-lock-in-stage__row-label">
									Usual session
								</p>
								<p className="mymind-wrapped-lock-in-stage__row-value">
									{model.averageDurationLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-lock-in-stage__track"
							>
								<span
									className="mymind-wrapped-lock-in-stage__fill is-average"
									style={averageStyle}
								/>
							</span>
						</li>

						<li className="mymind-wrapped-lock-in-stage__row">
							<header className="mymind-wrapped-lock-in-stage__row-head">
								<p className="mymind-wrapped-lock-in-stage__row-label">
									Longest recorded
								</p>
								<p className="mymind-wrapped-lock-in-stage__row-value">
									{model.longestDurationLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-lock-in-stage__track"
							>
								<span
									className="mymind-wrapped-lock-in-stage__fill is-longest"
									style={longestStyle}
								/>
							</span>
						</li>
					</ul>
				</article>
			}
			support={
				<p className="mymind-wrapped-lock-in-stage__footnote">
					{model.footnote}
				</p>
			}
		/>
	);
}

export function WrappedOnboardingQualityStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveQualityStageModel(
		resolveQualityPreviewInput(
			{
				commitRate: onboardingMetrics.commitRate,
				successRate: onboardingMetrics.successRate,
			},
			previewState,
		),
	);
	const commitStyle: QualityMeterStyle = {
		"--quality-stage-meter-value": `${model.commitShare}%`,
	};
	const successStyle: QualityMeterStyle = {
		"--quality-stage-meter-value": `${model.successShare}%`,
	};

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-quality-stage"
			objectClassName="mymind-wrapped-quality-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article
					className={cn(
						"mymind-wrapped-quality-stage__card",
						`is-${model.state}`,
					)}
				>
					<ul className="mymind-wrapped-quality-stage__stats">
						<li className="mymind-wrapped-quality-stage__stat">
							<p className="mymind-wrapped-quality-stage__stat-label">
								Commit rate
							</p>
							<p className="mymind-wrapped-quality-stage__stat-value">
								{model.commitRateLabel}
							</p>
						</li>
						<li className="mymind-wrapped-quality-stage__stat">
							<p className="mymind-wrapped-quality-stage__stat-label">
								Success rate
							</p>
							<p className="mymind-wrapped-quality-stage__stat-value">
								{model.successRateLabel}
							</p>
						</li>
					</ul>

					<ul className="mymind-wrapped-quality-stage__chips">
						<li className="mymind-wrapped-quality-stage__chip is-state">
							{model.stateLabel}
						</li>
						<li className="mymind-wrapped-quality-stage__chip">
							{model.comparisonLabel}
						</li>
					</ul>

					<ul className="mymind-wrapped-quality-stage__compare">
						<li
							className={cn(
								"mymind-wrapped-quality-stage__row",
								!model.hasCommitRate ? "is-pending" : undefined,
							)}
						>
							<header className="mymind-wrapped-quality-stage__row-head">
								<p className="mymind-wrapped-quality-stage__row-label">
									Sessions with commits
								</p>
								<p className="mymind-wrapped-quality-stage__row-value">
									{model.commitRateLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-quality-stage__track"
							>
								<span
									className="mymind-wrapped-quality-stage__fill is-commit"
									style={commitStyle}
								/>
							</span>
						</li>

						<li
							className={cn(
								"mymind-wrapped-quality-stage__row",
								!model.hasSuccessRate ? "is-pending" : undefined,
							)}
						>
							<header className="mymind-wrapped-quality-stage__row-head">
								<p className="mymind-wrapped-quality-stage__row-label">
									Successful sessions
								</p>
								<p className="mymind-wrapped-quality-stage__row-value">
									{model.successRateLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-quality-stage__track"
							>
								<span
									className="mymind-wrapped-quality-stage__fill is-success"
									style={successStyle}
								/>
							</span>
						</li>
					</ul>
				</article>
			}
			support={
				<p className="mymind-wrapped-quality-stage__footnote">
					{model.footnote}
				</p>
			}
		/>
	);
}

export function WrappedOnboardingRepoPulseStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveRepoPulseStageModel(
		resolveRepoPulsePreviewInput(onboardingMetrics.repoPulse, previewState),
	);

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-repo-pulse-stage"
			objectClassName="mymind-wrapped-repo-pulse-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article className="mymind-wrapped-repo-pulse-stage__card">
					<header className="mymind-wrapped-repo-pulse-stage__section-head">
						<p className="mymind-wrapped-repo-pulse-stage__section-label">
							Top repos
						</p>
						<p className="mymind-wrapped-repo-pulse-stage__section-value">
							{model.totalSessionsLabel}
						</p>
					</header>

					<ul className="mymind-wrapped-repo-pulse-stage__stack">
						{model.entries.map((entry) => (
							<li
								key={entry.id}
								className="mymind-wrapped-repo-pulse-stage__row"
							>
								<section className="mymind-wrapped-repo-pulse-stage__row-copy">
									<p className="mymind-wrapped-repo-pulse-stage__repo">
										{entry.repoName}
									</p>
									<p className="mymind-wrapped-repo-pulse-stage__proof">
										{entry.proof}
									</p>
									<p className="mymind-wrapped-repo-pulse-stage__meta">
										{entry.meta}
									</p>
								</section>
							</li>
						))}

						{model.entries.length === 0 ? (
							<li className="mymind-wrapped-repo-pulse-stage__empty">
								Repo work types show up once a few project sessions land.
							</li>
						) : null}
					</ul>
				</article>
			}
		/>
	);
}
