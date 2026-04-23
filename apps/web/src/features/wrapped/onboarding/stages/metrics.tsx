import { useReducedMotion } from "motion/react";
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
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
}

interface LockInMeterStyle extends CSSProperties {
	"--lock-in-stage-meter-value": string;
}

interface QualityMeterStyle extends CSSProperties {
	"--quality-stage-meter-value": string;
}

export function WrappedOnboardingScaleStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const totalTokens = resolveScalePreviewTokens(
		onboardingMetrics.totalTokens,
		previewState,
	);
	const model = resolveScaleStageModel(totalTokens);

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-scale-stage"
			copy={
				<WrappedOnboardingStageCopy
					key={`scale-count:${model.totalTokens}`}
					title={<WrappedScaleCountTitle totalTokens={model.totalTokens} />}
					titleClassName="mymind-wrapped-scale-stage__headline"
				/>
			}
		/>
	);
}

function WrappedScaleCountTitle(props: { totalTokens: number }) {
	const { totalTokens } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [displayValue, setDisplayValue] = useState(() => {
		return reduceMotion ? totalTokens : 0;
	});

	useMountEffect(() => {
		if (reduceMotion || totalTokens <= 0) {
			setDisplayValue(totalTokens);
			return;
		}

		const durationMs = 1100;
		const startTime = window.performance.now();
		let frameId = 0;

		const tick = (currentTime: number) => {
			const elapsedMs = currentTime - startTime;
			const progress = Math.min(elapsedMs / durationMs, 1);
			const easedProgress = 1 - (1 - progress) ** 3;
			setDisplayValue(Math.round(totalTokens * easedProgress));

			if (progress < 1) {
				frameId = window.requestAnimationFrame(tick);
			}
		};

		frameId = window.requestAnimationFrame(tick);

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	});

	return <>{displayValue.toLocaleString("en-US")} tokens</>;
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
