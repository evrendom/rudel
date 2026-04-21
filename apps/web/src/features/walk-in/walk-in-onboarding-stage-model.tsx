import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
	getModelStageTone,
	resolveModelPreviewInput,
	resolveModelStageModel,
} from "./walk-in-onboarding-models";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

interface ModelStageProps {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}

interface ModelSegmentStyle extends CSSProperties {
	"--model-stage-segment-color": string;
	"--model-stage-segment-share": string;
}

export function WalkInOnboardingModelStage(props: ModelStageProps) {
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
									{model.summary.map((segment) => {
										const segmentStyle: ModelSegmentStyle = {
											"--model-stage-segment-color": getModelStageTone(
												segment.source,
											),
											"--model-stage-segment-share": `${segment.share}%`,
										};

										return (
											<span
												key={segment.id}
												className="mymind-walk-in-model-stage__summary-segment"
												style={segmentStyle}
												title={`${segment.label}: ${Math.round(segment.share)}%`}
											/>
										);
									})}
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
											{month.segments.map((segment) => {
												const segmentStyle: ModelSegmentStyle = {
													"--model-stage-segment-color": getModelStageTone(
														segment.source,
													),
													"--model-stage-segment-share": `${segment.share}%`,
												};

												return (
													<span
														key={segment.id}
														className="mymind-walk-in-model-stage__month-segment"
														style={segmentStyle}
													/>
												);
											})}
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
