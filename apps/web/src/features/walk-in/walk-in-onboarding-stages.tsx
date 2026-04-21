import { BadgeCheck, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type {
	CSSProperties,
	TouchEvent,
	UIEvent,
	WheelEvent,
} from "react";
import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import type { WalkInStep } from "./walk-in-onboarding-config";
import {
	buildIntroCommitGraph,
	resolveIntroPreviewInput,
	resolveIntroStageModel,
	resolveUploadStageModel,
	type UploadStageRollItem,
} from "./walk-in-onboarding-helpers";
import {
	SCALE_STAGE_MIN_BALL_COUNT,
	SCALE_STAGE_TOKENS_PER_BALL,
	SKILLS_STACK,
	buildScaleRainBalls,
	buildStepContent,
	clampSkillsCardIndex,
	formatCompactNumber,
	getModelStageTone,
	getScaleRainBallCoreStyle,
	getScaleRainBallStyle,
	getSkillsCardStyle,
	getToolsEntryStyle,
	getToolsStackHeightRem,
	resolveLockInPreviewInput,
	resolveLockInStageModel,
	resolveModelPreviewInput,
	resolveModelStageModel,
	resolveQualityPreviewInput,
	resolveQualityStageModel,
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
	resolveScalePreviewTokens,
	resolveScaleStageModel,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
} from "./walk-in-onboarding-models";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

const UPLOAD_REEL_TIMING = {
	advance: 1800,
};

const UPLOAD_REEL = {
	itemHeight: 52,
	activeScale: 1,
	adjacentScale: 0.88,
	farScale: 0.76,
	activeOpacity: 1,
	adjacentOpacity: 0.52,
	farOpacity: 0,
	spring: {
		type: "spring" as const,
		stiffness: 360,
		damping: 30,
	},
};

const INTRO_EXIT = {
	distance: 72,
	duration: 0.24,
	lineDelay: 0.04,
	ease: [0.22, 1, 0.36, 1] as const,
};

interface WalkInOnboardingStageProps {
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	step: WalkInStep;
	totalSessions: number;
}

interface WalkInOnboardingScaleRainBackdropProps {
	reduceMotion: boolean;
	totalTokens: number;
}

export function WalkInOnboardingStage(props: WalkInOnboardingStageProps) {
	const {
		displayName,
		isExiting,
		onboardingMetrics,
		previewState,
		step,
		totalSessions,
	} = props;

	if (step.id === "upload") {
		return <UploadStage previewState={previewState} />;
	}

	if (step.id === "intro") {
		return (
			<IntroStage
				displayName={displayName}
				isExiting={isExiting}
				isSparse={totalSessions < 10}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
				totalSessions={totalSessions}
			/>
		);
	}

	if (step.id === "skills") {
		return (
			<SkillsStage
				key={`skills:${previewState}:${onboardingMetrics.topSkills.length}:${onboardingMetrics.skillsAdoptionRate ?? -1}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "tools") {
		return (
			<ToolsStage
				key={`tools:${previewState}:${onboardingMetrics.topSlashCommands.length}:${onboardingMetrics.topSubagents.length}:${onboardingMetrics.topSlashCommandCount ?? -1}:${onboardingMetrics.topSubagentCount ?? -1}:${onboardingMetrics.totalSessions}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<ModelStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "pulse") {
		return (
			<RepoPulseStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "scale") {
		return (
			<ScaleStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "lock-in") {
		return (
			<LockInStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "quality") {
		return (
			<QualityStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	const content = buildStepContent({
		displayName,
		onboardingMetrics,
		previewState,
		stepId: step.id,
		totalSessions,
	});

	return (
		<section className="mymind-walk-in-copy-stage">
			<div className="mymind-walk-in-copy-stage__content">
				{content.map((line) => (
					<p
						key={`${line.tone ?? "default"}:${line.text}`}
						className={cn(
							"mymind-walk-in-copy-stage__line",
							line.tone === "danger"
								? "text-red-700 dark:text-red-400"
								: undefined,
						)}
					>
						{line.text}
					</p>
				))}
			</div>
		</section>
	);
}

export function WalkInOnboardingScaleRainBackdrop(
	props: WalkInOnboardingScaleRainBackdropProps,
) {
	const { reduceMotion, totalTokens } = props;
	const balls = buildScaleRainBalls(totalTokens);

	return (
		<div
			aria-hidden="true"
			className={cn(
				"mymind-walk-in-scale-rain",
				reduceMotion ? "is-reduced-motion" : undefined,
			)}
		>
			<div className="mymind-walk-in-scale-rain__ambient">
				<div className="mymind-walk-in-scale-rain__glow is-peach" />
				<div className="mymind-walk-in-scale-rain__glow is-blue" />
			</div>
			{balls.map((ball) => (
				<span
					key={ball.id}
					className="mymind-walk-in-scale-rain__ball"
					style={getScaleRainBallStyle(ball)}
				>
					<span
						className="mymind-walk-in-scale-rain__ball-core"
						style={getScaleRainBallCoreStyle(ball)}
					/>
				</span>
			))}
		</div>
	);
}

function ScaleStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
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

function LockInStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
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
									style={
										{
											"--lock-in-stage-meter-value": `${model.averageShare}%`,
										} as CSSProperties
									}
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
									style={
										{
											"--lock-in-stage-meter-value": `${model.longestShare}%`,
										} as CSSProperties
									}
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

function QualityStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
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
									style={
										{
											"--quality-stage-meter-value": `${model.commitShare}%`,
										} as CSSProperties
									}
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
									style={
										{
											"--quality-stage-meter-value": `${model.successShare}%`,
										} as CSSProperties
									}
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

function ToolsStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveToolsStageModel(
		resolveToolsPreviewInput(
			{
				slashCommandsAdoptionRate: onboardingMetrics.slashCommandsAdoptionRate,
				subagentsAdoptionRate: onboardingMetrics.subagentsAdoptionRate,
				topSlashCommand: onboardingMetrics.topSlashCommand,
				topSlashCommands: onboardingMetrics.topSlashCommands,
				topSlashCommandCount: onboardingMetrics.topSlashCommandCount,
				topSubagent: onboardingMetrics.topSubagent,
				topSubagents: onboardingMetrics.topSubagents,
				topSubagentCount: onboardingMetrics.topSubagentCount,
				totalSessions: onboardingMetrics.totalSessions,
			},
			previewState,
		),
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);

	return (
		<section className="mymind-walk-in-tools-stage">
			<div className="mymind-walk-in-tools-stage__hero">
				<p className="mymind-walk-in-tools-stage__eyebrow">Workflow tools</p>
				<h2 className="mymind-walk-in-tools-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-tools-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-tools-stage__object">
				<article
					className="mymind-walk-in-tools-stage__card"
					style={
						{
							"--tools-stack-height": `${getToolsStackHeightRem(
								model.entries.length,
							)}rem`,
						} as CSSProperties
					}
				>
					<div className="mymind-walk-in-tools-stage__list">
						{model.entries.map((entry, entryIndex) => (
							<button
								key={entry.id}
								aria-label={`${entry.name}. ${entry.usageLabel}`}
								aria-pressed={entryIndex === activeCardIndex}
								className={cn(
									"mymind-walk-in-tools-stage__entry",
									entryIndex === activeCardIndex && "is-front",
									entry.isPlaceholder && "is-placeholder",
								)}
								onClick={() => setActiveCardIndex(entryIndex)}
								onFocus={() => setActiveCardIndex(entryIndex)}
								style={getToolsEntryStyle(
									entryIndex,
									model.entries.length,
									activeCardIndex,
								)}
								type="button"
							>
								<div className="mymind-walk-in-tools-stage__entry-top">
									<p className="mymind-walk-in-tools-stage__entry-usage">
										{entry.usageLabel}
									</p>
								</div>
								<p className="mymind-walk-in-tools-stage__entry-name">
									{entry.name}
								</p>
								<div
									aria-hidden="true"
									className="mymind-walk-in-tools-stage__meter"
								>
									<span
										className="mymind-walk-in-tools-stage__meter-fill"
										style={
											{
												"--tools-stage-meter-value": `${entry.usageRate ?? 0}%`,
											} as CSSProperties
										}
									/>
								</div>
							</button>
						))}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-tools-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function ModelStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveModelStageModel(
		resolveModelPreviewInput(
			{
				modelByMonth: onboardingMetrics.modelByMonth,
				sourceSplit: onboardingMetrics.sourceSplit,
			},
			previewState,
		),
	);

	return (
		<section className="mymind-walk-in-model-stage">
			<div className="mymind-walk-in-model-stage__hero">
				<p className="mymind-walk-in-model-stage__eyebrow">Model mix</p>
				<h2 className="mymind-walk-in-model-stage__headline">{model.headline}</h2>
				<p className="mymind-walk-in-model-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-model-stage__object">
				<article className="mymind-walk-in-model-stage__card">
					<div className="mymind-walk-in-model-stage__summary-card">
						<div className="mymind-walk-in-model-stage__section-head">
							<p className="mymind-walk-in-model-stage__section-label">
								Entire period
							</p>
							<p className="mymind-walk-in-model-stage__section-value">
								{model.totalSessionsLabel}
							</p>
						</div>

						{model.summary.length === 0 ? (
							<p className="mymind-walk-in-model-stage__empty">
								The all-time split shows up once session history lands.
							</p>
						) : (
							<>
								<div
									aria-hidden="true"
									className="mymind-walk-in-model-stage__summary-track"
								>
									{model.summary.map((segment) => (
										<span
											key={segment.id}
											className="mymind-walk-in-model-stage__summary-segment"
											style={
												{
													"--model-stage-segment-color": getModelStageTone(
														segment.source,
													),
													"--model-stage-segment-share": `${segment.share}%`,
												} as CSSProperties
											}
											title={`${segment.label}: ${Math.round(segment.share)}%`}
										/>
									))}
								</div>

								<div className="mymind-walk-in-model-stage__legend">
									{model.summary.map((segment) => (
										<div
											key={segment.id}
											className="mymind-walk-in-model-stage__legend-row"
										>
											<span
												aria-hidden="true"
												className="mymind-walk-in-model-stage__legend-dot"
												style={{
													backgroundColor: getModelStageTone(segment.source),
												}}
											/>
											<p className="mymind-walk-in-model-stage__legend-name">
												{segment.label}
											</p>
											<p className="mymind-walk-in-model-stage__legend-value">
												{Math.round(segment.share)}%
											</p>
										</div>
									))}
								</div>
							</>
						)}
					</div>

					<div className="mymind-walk-in-model-stage__months-card">
						<div className="mymind-walk-in-model-stage__section-head">
							<p className="mymind-walk-in-model-stage__section-label">
								Last 6 months
							</p>
							<p className="mymind-walk-in-model-stage__section-value">
								{model.monthsLabel}
							</p>
						</div>

						{model.months.length === 0 ? (
							<p className="mymind-walk-in-model-stage__empty">
								The monthly stacks fill in once model history spans a few sessions.
							</p>
						) : (
							<div className="mymind-walk-in-model-stage__month-grid">
								{model.months.map((month) => (
									<div
										key={month.id}
										className="mymind-walk-in-model-stage__month-column"
										title={
											month.totalSessions > 0
												? `${month.label}: ${month.leaderLabel} led with ${month.leaderShare}%`
												: `${month.label}: no model activity`
										}
									>
										<div
											aria-hidden="true"
											className={cn(
												"mymind-walk-in-model-stage__month-bar",
												month.totalSessions === 0 ? "is-empty" : null,
											)}
										>
											{month.segments.map((segment) => (
												<span
													key={segment.id}
													className="mymind-walk-in-model-stage__month-segment"
													style={
														{
															"--model-stage-segment-color": getModelStageTone(
																segment.source,
															),
															"--model-stage-segment-share": `${segment.share}%`,
														} as CSSProperties
													}
												/>
											))}
										</div>
										<p className="mymind-walk-in-model-stage__month-label">
											{month.label}
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-model-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function IntroStage(props: {
	displayName: string;
	isSparse: boolean;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	totalSessions: number;
}) {
	const {
		displayName,
		isExiting,
		isSparse,
		onboardingMetrics,
		previewState,
		totalSessions,
	} = props;
	const introInput = resolveIntroPreviewInput(
		{
			activeDays: onboardingMetrics.activeDays,
			daysSinceFirst: onboardingMetrics.daysSinceFirst,
			displayName,
			totalSessions,
		},
		previewState,
	);
	const model = resolveIntroStageModel(introInput);
	const commitGraph = buildIntroCommitGraph(introInput);

	return (
		<section className="mymind-walk-in-intro-stage">
			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								x: -INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				className="mymind-walk-in-intro-stage__hero"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
							}
						: { duration: 0 }
				}
			>
				<h2 className="mymind-walk-in-intro-stage__headline">{model.headline}</h2>
			</motion.div>

			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								y: 14,
							}
						: { opacity: 1, y: 0 }
				}
				aria-hidden="true"
				className="mymind-walk-in-intro-stage__commit-graph"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 2,
							}
						: { duration: 0 }
				}
			>
				{commitGraph.map((dot) => (
					<span
						key={dot.id}
						className={cn(
							"mymind-walk-in-intro-stage__commit-dot",
							`is-level-${dot.level}`,
						)}
					/>
				))}
			</motion.div>

			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								x: INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				className={cn(
					"mymind-walk-in-intro-stage__signal-card",
					isSparse && "is-sparse",
				)}
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay,
							}
						: { duration: 0 }
				}
			>
				<div className="mymind-walk-in-intro-stage__signal-main">
					<p className="mymind-walk-in-intro-stage__signal-value">
						{model.cardValue}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-detail">
						{model.cardDetail}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-meta">
						{model.cardMeta}
					</p>
				</div>
			</motion.div>

			<motion.p
				animate={
					isExiting
						? {
								opacity: 0,
								y: 12,
							}
						: { opacity: 1, y: 0 }
				}
				className="mymind-walk-in-intro-stage__footnote"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 3,
							}
						: { duration: 0 }
				}
			>
				{model.footnote}
			</motion.p>
		</section>
	);
}

function SkillsStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const wheelAccumulationRef = useRef(0);
	const lastWheelTimestampRef = useRef(0);
	const lockedUntilTimestampRef = useRef(0);
	const touchStartYRef = useRef<number | null>(null);
	const model = resolveSkillsStageModel(
		resolveSkillsPreviewInput(
			{
				skillsAdoptionRate: onboardingMetrics.skillsAdoptionRate,
				topSkills: onboardingMetrics.topSkills,
			},
			previewState,
		),
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);

	function setNextActiveCardIndex(direction: 1 | -1) {
		setActiveCardIndex((previousIndex) =>
			clampSkillsCardIndex(previousIndex + direction, model.cards.length),
		);
	}

	function handleSkillsCardWheelDelta(deltaY: number) {
		if (!model.isScrollable || deltaY === 0) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		if (now - lastWheelTimestampRef.current > SKILLS_STACK.wheelResetMs) {
			wheelAccumulationRef.current = 0;
		}

		lastWheelTimestampRef.current = now;
		wheelAccumulationRef.current += deltaY;

		if (Math.abs(wheelAccumulationRef.current) < SKILLS_STACK.wheelThresholdPx) {
			return;
		}

		const direction = wheelAccumulationRef.current > 0 ? 1 : -1;
		wheelAccumulationRef.current = 0;
		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(direction);
	}

	function handleSkillsCardWheel(event: WheelEvent<HTMLDivElement>) {
		if (!model.isScrollable) {
			return;
		}

		const eventTarget = event.target;
		if (!(eventTarget instanceof Element)) {
			return;
		}

		const cardElement = eventTarget.closest(".mymind-walk-in-skills-stage__card");
		if (!cardElement || !event.currentTarget.contains(cardElement)) {
			return;
		}

		event.preventDefault();
		handleSkillsCardWheelDelta(event.deltaY);
	}

	function handleSkillsCardTouchStart(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable) {
			return;
		}

		touchStartYRef.current = event.touches[0]?.clientY ?? null;
	}

	function handleSkillsCardTouchEnd(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable) {
			return;
		}

		const touchStartY = touchStartYRef.current;
		const touchEndY = event.changedTouches[0]?.clientY ?? null;
		touchStartYRef.current = null;

		if (touchStartY === null || touchEndY === null) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		const deltaY = touchStartY - touchEndY;
		if (Math.abs(deltaY) < SKILLS_STACK.touchThresholdPx) {
			return;
		}

		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(deltaY > 0 ? 1 : -1);
	}

	return (
		<section className="mymind-walk-in-skills-stage">
			<div className="mymind-walk-in-skills-stage__hero">
				<p className="mymind-walk-in-skills-stage__eyebrow">Skills board</p>
				<h2 className="mymind-walk-in-skills-stage__headline">
					{model.headline}
				</h2>
				{model.subline ? (
					<p className="mymind-walk-in-skills-stage__subline">{model.subline}</p>
				) : null}
			</div>

			<div
				className="mymind-walk-in-skills-stage__stack"
				onWheel={handleSkillsCardWheel}
			>
				<div
					className="mymind-walk-in-skills-stage__stack-track"
					style={
						{
							"--skills-stack-track-height": `${model.trackHeightRem}rem`,
						} as CSSProperties
					}
				>
					{model.cards.map((card, cardIndex) => (
						<article
							key={card.id}
							className={cn(
								"mymind-walk-in-skills-stage__card",
								cardIndex === activeCardIndex && "is-front",
							)}
							onTouchEnd={handleSkillsCardTouchEnd}
							onTouchStart={handleSkillsCardTouchStart}
							style={getSkillsCardStyle(cardIndex, activeCardIndex)}
						>
							<div
								className={cn(
									"mymind-walk-in-skills-stage__card-item",
									card.item.isPlaceholder && "is-placeholder",
								)}
							>
								<span className="mymind-walk-in-skills-stage__item-rank">
									{card.item.rank}
								</span>
								<div className="mymind-walk-in-skills-stage__item-copy">
									<p className="mymind-walk-in-skills-stage__item-name">
										{card.item.name}
									</p>
									<p className="mymind-walk-in-skills-stage__item-meta">
										{card.item.meta}
									</p>
								</div>
							</div>
						</article>
					))}
				</div>
			</div>

			<p className="mymind-walk-in-skills-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function RepoPulseStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
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

function UploadStage(props: { previewState: string }) {
	const { previewState } = props;
	const model = resolveUploadStageModel(previewState);

	return (
		<section className="mymind-walk-in-upload-stage">
			<div className="mymind-walk-in-upload-card">
				<div className="mymind-walk-in-upload-card__summary">
					<p className="mymind-walk-in-upload-card__body">{model.cardBody}</p>
					{model.cardMeta ? (
						<p className="mymind-walk-in-upload-card__meta">{model.cardMeta}</p>
					) : null}
				</div>

				<UploadStageReel
					isUploading={model.isUploading}
					items={model.rollItems}
				/>

				<div
					className={cn(
						"mymind-walk-in-upload-card__tag",
						model.isUploading ? "is-uploading" : "is-ready",
					)}
				>
					{model.isUploading ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<BadgeCheck className="size-4" />
					)}
					<span>{model.cardEyebrow}</span>
				</div>
			</div>
		</section>
	);
}

function UploadStageReel(props: {
	isUploading: boolean;
	items: readonly UploadStageRollItem[];
}) {
	const { isUploading, items } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const reelKey = [
		isUploading ? "uploading" : "ready",
		reduceMotion ? "reduced" : "motion",
		...items.map((item) => `${item.id}:${item.label}:${item.meta}`),
	].join("|");

	return (
		<UploadStageReelContent
			key={reelKey}
			isUploading={isUploading}
			items={items}
			reduceMotion={reduceMotion}
		/>
	);
}

function UploadStageReelContent(props: {
	isUploading: boolean;
	items: readonly UploadStageRollItem[];
	reduceMotion: boolean;
}) {
	const { isUploading, items, reduceMotion } = props;
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const initialIndex = getDefaultUploadReelIndex(items.length, isUploading);
	const [activeIndex, setActiveIndex] = useState(initialIndex);

	useMountEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			scrollUploadReelToIndex({
				index: initialIndex,
				shouldReduceMotion: true,
				viewport: viewportRef.current,
			});
		});

		if (reduceMotion || !isUploading || items.length < 2) {
			return () => {
				window.cancelAnimationFrame(frameId);
			};
		}

		const intervalId = window.setInterval(() => {
			setActiveIndex((previousIndex) => {
				const nextIndex = (previousIndex + 1) % items.length;
				scrollUploadReelToIndex({
					index: nextIndex,
					shouldReduceMotion: reduceMotion,
					viewport: viewportRef.current,
				});
				return nextIndex;
			});
		}, UPLOAD_REEL_TIMING.advance);

		return () => {
			window.cancelAnimationFrame(frameId);
			window.clearInterval(intervalId);
		};
	});

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="mymind-walk-in-upload-reel">
			<div
				ref={viewportRef}
				className="mymind-walk-in-upload-reel__viewport"
				onScroll={(event) => {
					handleUploadReelScroll({
						event,
						itemCount: items.length,
						onIndexChange: setActiveIndex,
					});
				}}
			>
				<div className="mymind-walk-in-upload-reel__list">
					{items.map((item, index) => {
						const relativePosition = getUploadReelRelativePosition({
							activeIndex,
							index,
							total: items.length,
						});
						const motionState = getUploadReelMotionState(relativePosition);

						return (
							<motion.div
								key={item.id}
								animate={motionState}
								className="mymind-walk-in-upload-reel__item"
								data-active={relativePosition === 0 ? "true" : "false"}
								initial={false}
								transition={UPLOAD_REEL.spring}
							>
								<p className="mymind-walk-in-upload-reel__label">
									{item.label}
								</p>
								<p className="mymind-walk-in-upload-reel__meta">{item.meta}</p>
							</motion.div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function handleUploadReelScroll(input: {
	event: UIEvent<HTMLDivElement>;
	itemCount: number;
	onIndexChange: (value: number | ((previousValue: number) => number)) => void;
}) {
	const { event, itemCount, onIndexChange } = input;

	if (itemCount <= 1) {
		return;
	}

	const nextIndex = Math.max(
		0,
		Math.min(
			itemCount - 1,
			Math.round(event.currentTarget.scrollTop / UPLOAD_REEL.itemHeight),
		),
	);

	onIndexChange((previousIndex) =>
		previousIndex === nextIndex ? previousIndex : nextIndex,
	);
}

function scrollUploadReelToIndex(input: {
	index: number;
	shouldReduceMotion: boolean;
	viewport: HTMLDivElement | null;
}) {
	const { index, shouldReduceMotion, viewport } = input;

	if (!viewport) {
		return;
	}

	viewport.scrollTo({
		top: index * UPLOAD_REEL.itemHeight,
		behavior: shouldReduceMotion ? "auto" : "smooth",
	});
}

function getDefaultUploadReelIndex(total: number, isUploading: boolean) {
	if (total <= 1 || isUploading) {
		return 0;
	}

	return total - 1;
}

function getUploadReelRelativePosition(input: {
	activeIndex: number;
	index: number;
	total: number;
}) {
	const { activeIndex, index, total } = input;

	if (total <= 1) {
		return 0;
	}

	const forwardDistance = (index - activeIndex + total) % total;

	if (forwardDistance === 0) {
		return 0;
	}

	if (forwardDistance === 1) {
		return 1;
	}

	if (forwardDistance === total - 1) {
		return -1;
	}

	return forwardDistance < total / 2 ? 2 : -2;
}

function getUploadReelMotionState(relativePosition: number) {
	switch (relativePosition) {
		case 0:
			return {
				opacity: UPLOAD_REEL.activeOpacity,
				scale: UPLOAD_REEL.activeScale,
				zIndex: 3,
			};
		case -1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		case 1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		default:
			return {
				opacity: UPLOAD_REEL.farOpacity,
				scale: UPLOAD_REEL.farScale,
				zIndex: 1,
			};
	}
}
