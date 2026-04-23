import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
	getModelStageTone,
	resolveModelPreviewInput,
	resolveModelStageModel,
} from "../models";
import type { WrappedOnboardingMetrics } from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface ModelStageProps {
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
}

interface ModelSegmentStyle extends CSSProperties {
	"--model-stage-segment-color": string;
	"--model-stage-segment-share": string;
}

export function WrappedOnboardingModelStage(props: ModelStageProps) {
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
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-model-stage"
			copy={
				<WrappedOnboardingStageCopy
					eyebrow="Model mix"
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<div className="mymind-wrapped-model-stage__object">
					<article className="mymind-wrapped-model-stage__card">
						<div className="mymind-wrapped-model-stage__summary-card">
							<div className="mymind-wrapped-model-stage__section-head">
								<p className="mymind-wrapped-model-stage__section-label">
									Entire period
								</p>
								<p className="mymind-wrapped-model-stage__section-value">
									{model.totalSessionsLabel}
								</p>
							</div>

							{model.summary.length === 0 ? (
								<p className="mymind-wrapped-model-stage__empty">
									The all-time split shows up once session history lands.
								</p>
							) : (
								<>
									<div
										aria-hidden="true"
										className="mymind-wrapped-model-stage__summary-track"
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
													className="mymind-wrapped-model-stage__summary-segment"
													style={segmentStyle}
													title={`${segment.label}: ${Math.round(segment.share)}%`}
												/>
											);
										})}
									</div>

									<div className="mymind-wrapped-model-stage__legend">
										{model.summary.map((segment) => (
											<div
												key={segment.id}
												className="mymind-wrapped-model-stage__legend-row"
											>
												<span
													aria-hidden="true"
													className="mymind-wrapped-model-stage__legend-dot"
													style={{
														backgroundColor: getModelStageTone(segment.source),
													}}
												/>
												<p className="mymind-wrapped-model-stage__legend-name">
													{segment.label}
												</p>
												<p className="mymind-wrapped-model-stage__legend-value">
													{Math.round(segment.share)}%
												</p>
											</div>
										))}
									</div>
								</>
							)}
						</div>

						<div className="mymind-wrapped-model-stage__months-card">
							<div className="mymind-wrapped-model-stage__section-head">
								<p className="mymind-wrapped-model-stage__section-label">
									Last 6 months
								</p>
								<p className="mymind-wrapped-model-stage__section-value">
									{model.monthsLabel}
								</p>
							</div>

							{model.months.length === 0 ? (
								<p className="mymind-wrapped-model-stage__empty">
									The monthly stacks fill in once model history spans a few
									sessions.
								</p>
							) : (
								<div className="mymind-wrapped-model-stage__month-grid">
									{model.months.map((month) => (
										<div
											key={month.id}
											className="mymind-wrapped-model-stage__month-column"
											title={
												month.totalSessions > 0
													? `${month.label}: ${month.leaderLabel} led with ${month.leaderShare}%`
													: `${month.label}: no model activity`
											}
										>
											<div
												aria-hidden="true"
												className={cn(
													"mymind-wrapped-model-stage__month-bar",
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
															className="mymind-wrapped-model-stage__month-segment"
															style={segmentStyle}
														/>
													);
												})}
											</div>
											<p className="mymind-wrapped-model-stage__month-label">
												{month.label}
											</p>
										</div>
									))}
								</div>
							)}
						</div>
					</article>
				</div>
			}
			support={
				<p className="mymind-wrapped-model-stage__footnote">{model.footnote}</p>
			}
		/>
	);
}
