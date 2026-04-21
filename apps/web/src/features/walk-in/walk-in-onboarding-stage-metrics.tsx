import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
	SCALE_STAGE_MIN_BALL_COUNT,
	SCALE_STAGE_TOKENS_PER_BALL,
	formatCompactNumber,
	resolveLockInPreviewInput,
	resolveLockInStageModel,
	resolveQualityPreviewInput,
	resolveQualityStageModel,
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
	resolveScalePreviewTokens,
	resolveScaleStageModel,
} from "./walk-in-onboarding-models";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

interface SharedStageProps {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}

interface LockInMeterStyle extends CSSProperties {
	"--lock-in-stage-meter-value": string;
}

interface QualityMeterStyle extends CSSProperties {
	"--quality-stage-meter-value": string;
}

export function WalkInOnboardingScaleStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const totalTokens = resolveScalePreviewTokens(
		onboardingMetrics.totalTokens,
		previewState,
	);
	const model = resolveScaleStageModel(totalTokens);

	return (
		<section className="mymind-walk-in-scale-stage">
			<div className="mymind-walk-in-scale-stage__hero">
				<p className="mymind-walk-in-scale-stage__eyebrow">Token scale</p>
				<h2 className="mymind-walk-in-scale-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-scale-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-scale-stage__object">
				<article className="mymind-walk-in-scale-stage__card">
					<div className="mymind-walk-in-scale-stage__stats">
						<div className="mymind-walk-in-scale-stage__stat">
							<p className="mymind-walk-in-scale-stage__stat-label">
								Tokens logged
							</p>
							<p className="mymind-walk-in-scale-stage__stat-value">
								{formatCompactNumber(model.totalTokens)}
							</p>
						</div>
						<div className="mymind-walk-in-scale-stage__stat">
							<p className="mymind-walk-in-scale-stage__stat-label">
								Balls dropping
							</p>
							<p className="mymind-walk-in-scale-stage__stat-value">
								{model.displayBallCount.toLocaleString()}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-scale-stage__chips">
						<span className="mymind-walk-in-scale-stage__chip">
							{`1 ball = ${formatCompactNumber(SCALE_STAGE_TOKENS_PER_BALL)} tokens`}
						</span>
						{model.showsMinimumFloor ? (
							<span className="mymind-walk-in-scale-stage__chip is-highlight">
								{`${SCALE_STAGE_MIN_BALL_COUNT}-ball floor active`}
							</span>
						) : null}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-scale-stage__footnote">{model.footnote}</p>
		</section>
	);
}

export function WalkInOnboardingLockInStage(props: SharedStageProps) {
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
		<section className="mymind-walk-in-lock-in-stage">
			<div className="mymind-walk-in-lock-in-stage__hero">
				<p className="mymind-walk-in-lock-in-stage__eyebrow">Session length</p>
				<h2 className="mymind-walk-in-lock-in-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-lock-in-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-lock-in-stage__object">
				<article
					className={cn(
						"mymind-walk-in-lock-in-stage__card",
						`is-${model.state}`,
					)}
				>
					<div className="mymind-walk-in-lock-in-stage__stats">
						<div className="mymind-walk-in-lock-in-stage__stat">
							<p className="mymind-walk-in-lock-in-stage__stat-label">
								Longest recorded
							</p>
							<p className="mymind-walk-in-lock-in-stage__stat-value">
								{model.longestDurationLabel}
							</p>
						</div>
						<div className="mymind-walk-in-lock-in-stage__stat">
							<p className="mymind-walk-in-lock-in-stage__stat-label">
								Usual session
							</p>
							<p className="mymind-walk-in-lock-in-stage__stat-value">
								{model.averageDurationLabel}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-lock-in-stage__chips">
						<span className="mymind-walk-in-lock-in-stage__chip is-state">
							{model.stateLabel}
						</span>
						<span className="mymind-walk-in-lock-in-stage__chip">
							{model.comparisonLabel}
						</span>
					</div>

					<div className="mymind-walk-in-lock-in-stage__compare">
						<div className="mymind-walk-in-lock-in-stage__row">
							<div className="mymind-walk-in-lock-in-stage__row-head">
								<p className="mymind-walk-in-lock-in-stage__row-label">
									Usual session
								</p>
								<p className="mymind-walk-in-lock-in-stage__row-value">
									{model.averageDurationLabel}
								</p>
							</div>
							<div
								aria-hidden="true"
								className="mymind-walk-in-lock-in-stage__track"
							>
								<span
									className="mymind-walk-in-lock-in-stage__fill is-average"
									style={averageStyle}
								/>
							</div>
						</div>

						<div className="mymind-walk-in-lock-in-stage__row">
							<div className="mymind-walk-in-lock-in-stage__row-head">
								<p className="mymind-walk-in-lock-in-stage__row-label">
									Longest recorded
								</p>
								<p className="mymind-walk-in-lock-in-stage__row-value">
									{model.longestDurationLabel}
								</p>
							</div>
							<div
								aria-hidden="true"
								className="mymind-walk-in-lock-in-stage__track"
							>
								<span
									className="mymind-walk-in-lock-in-stage__fill is-longest"
									style={longestStyle}
								/>
							</div>
						</div>
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-lock-in-stage__footnote">{model.footnote}</p>
		</section>
	);
}

export function WalkInOnboardingQualityStage(props: SharedStageProps) {
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
		<section className="mymind-walk-in-quality-stage">
			<div className="mymind-walk-in-quality-stage__hero">
				<p className="mymind-walk-in-quality-stage__eyebrow">Finish quality</p>
				<h2 className="mymind-walk-in-quality-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-quality-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-quality-stage__object">
				<article
					className={cn(
						"mymind-walk-in-quality-stage__card",
						`is-${model.state}`,
					)}
				>
					<div className="mymind-walk-in-quality-stage__stats">
						<div className="mymind-walk-in-quality-stage__stat">
							<p className="mymind-walk-in-quality-stage__stat-label">
								Commit rate
							</p>
							<p className="mymind-walk-in-quality-stage__stat-value">
								{model.commitRateLabel}
							</p>
						</div>
						<div className="mymind-walk-in-quality-stage__stat">
							<p className="mymind-walk-in-quality-stage__stat-label">
								Success rate
							</p>
							<p className="mymind-walk-in-quality-stage__stat-value">
								{model.successRateLabel}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-quality-stage__chips">
						<span className="mymind-walk-in-quality-stage__chip is-state">
							{model.stateLabel}
						</span>
						<span className="mymind-walk-in-quality-stage__chip">
							{model.comparisonLabel}
						</span>
					</div>

					<div className="mymind-walk-in-quality-stage__compare">
						<div
							className={cn(
								"mymind-walk-in-quality-stage__row",
								!model.hasCommitRate ? "is-pending" : undefined,
							)}
						>
							<div className="mymind-walk-in-quality-stage__row-head">
								<p className="mymind-walk-in-quality-stage__row-label">
									Sessions with commits
								</p>
								<p className="mymind-walk-in-quality-stage__row-value">
									{model.commitRateLabel}
								</p>
							</div>
							<div
								aria-hidden="true"
								className="mymind-walk-in-quality-stage__track"
							>
								<span
									className="mymind-walk-in-quality-stage__fill is-commit"
									style={commitStyle}
								/>
							</div>
						</div>

						<div
							className={cn(
								"mymind-walk-in-quality-stage__row",
								!model.hasSuccessRate ? "is-pending" : undefined,
							)}
						>
							<div className="mymind-walk-in-quality-stage__row-head">
								<p className="mymind-walk-in-quality-stage__row-label">
									Successful sessions
								</p>
								<p className="mymind-walk-in-quality-stage__row-value">
									{model.successRateLabel}
								</p>
							</div>
							<div
								aria-hidden="true"
								className="mymind-walk-in-quality-stage__track"
							>
								<span
									className="mymind-walk-in-quality-stage__fill is-success"
									style={successStyle}
								/>
							</div>
						</div>
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-quality-stage__footnote">
				{model.footnote}
			</p>
		</section>
	);
}

export function WalkInOnboardingRepoPulseStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveRepoPulseStageModel(
		resolveRepoPulsePreviewInput(onboardingMetrics.repoPulse, previewState),
	);

	return (
		<section className="mymind-walk-in-repo-pulse-stage">
			<div className="mymind-walk-in-repo-pulse-stage__hero">
				<p className="mymind-walk-in-repo-pulse-stage__eyebrow">Repo pulse</p>
				<h2 className="mymind-walk-in-repo-pulse-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-repo-pulse-stage__subline">
					{model.subline}
				</p>
			</div>

			<div className="mymind-walk-in-repo-pulse-stage__object">
				<article className="mymind-walk-in-repo-pulse-stage__card">
					<div className="mymind-walk-in-repo-pulse-stage__card-top">
						<div
							aria-hidden="true"
							className="mymind-walk-in-repo-pulse-stage__card-dots"
						>
							<span />
							<span />
							<span />
						</div>
						<div className="mymind-walk-in-repo-pulse-stage__card-chip">
							Where the work happened
						</div>
					</div>

					<div className="mymind-walk-in-repo-pulse-stage__section-head">
						<p className="mymind-walk-in-repo-pulse-stage__section-label">
							Top repos
						</p>
						<p className="mymind-walk-in-repo-pulse-stage__section-value">
							{model.totalSessionsLabel}
						</p>
					</div>

					<div className="mymind-walk-in-repo-pulse-stage__stack">
						{model.entries.map((entry) => (
							<article
								key={entry.id}
								className="mymind-walk-in-repo-pulse-stage__row"
							>
								<p className="mymind-walk-in-repo-pulse-stage__role">
									{entry.workType}
								</p>
								<div className="mymind-walk-in-repo-pulse-stage__row-copy">
									<p className="mymind-walk-in-repo-pulse-stage__repo">
										{entry.repoName}
									</p>
									<p className="mymind-walk-in-repo-pulse-stage__proof">
										{entry.proof}
									</p>
									<p className="mymind-walk-in-repo-pulse-stage__meta">
										{entry.meta}
									</p>
								</div>
							</article>
						))}

						{model.entries.length === 0 ? (
							<article className="mymind-walk-in-repo-pulse-stage__empty">
								Repo work types show up once a few project sessions land.
							</article>
						) : null}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-repo-pulse-stage__footnote">
				{model.footnote}
			</p>
		</section>
	);
}
