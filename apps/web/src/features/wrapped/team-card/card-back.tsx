import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { WrappedTeamMemberCardTheme } from "./card";

export interface WrappedTeamMemberCardBackMetric {
	label: string;
	slot?: "body" | "footer";
	value: string;
}

export type WrappedTeamMemberCardBackVariant = "default" | "gradient-only";

export function WrappedTeamMemberCardBack(props: {
	disableOuterShadow?: boolean;
	metrics: readonly WrappedTeamMemberCardBackMetric[];
	shellClassName?: string;
	shellStyle?: CSSProperties;
	theme?: WrappedTeamMemberCardTheme;
	variant?: WrappedTeamMemberCardBackVariant;
}) {
	const {
		disableOuterShadow = false,
		metrics,
		shellClassName,
		shellStyle,
		theme = "light",
		variant = "default",
	} = props;
	const isDarkTheme = theme === "dark";
	const isMutedTheme = theme === "muted";
	const usesLightFooterInk = isDarkTheme;
	const shouldRenderContent = variant === "default";
	const bodyMetrics = metrics.filter((metric) => metric.slot !== "footer");
	const footerMetric =
		metrics.find((metric) => metric.slot === "footer") ?? null;
	const cardBackStyle = {
		"--wrapped-team-card-back-divider":
			isDarkTheme || isMutedTheme
				? "rgb(255 255 255 / 0.2)"
				: "rgb(23 22 28 / 0.18)",
		"--wrapped-team-card-back-muted":
			isDarkTheme || isMutedTheme
				? "rgb(255 247 239 / 0.74)"
				: "rgb(23 22 28 / 0.66)",
		"--wrapped-team-card-back-soft":
			isDarkTheme || isMutedTheme
				? "rgb(255 247 239 / 0.52)"
				: "rgb(23 22 28 / 0.48)",
		"--wrapped-team-card-back-footer-ink": usesLightFooterInk
			? "rgb(255 247 239 / 0.78)"
			: "rgb(23 22 28 / 0.74)",
	} as CSSProperties;
	const outerShadowStyle = {
		boxShadow: disableOuterShadow
			? "inset 0 1px 0 rgb(255 255 255 / 0.16)"
			: undefined,
	} as CSSProperties;

	return (
		<article
			data-testid="wrapped-team-card-back"
			className={cn(
				"mymind-wrapped-team-card-back",
				"relative isolate overflow-hidden",
				shellClassName,
				isDarkTheme ? "text-[#fff7ef]" : null,
				isMutedTheme ? "text-[#f6efe4]" : null,
			)}
			style={{ ...cardBackStyle, ...shellStyle, ...outerShadowStyle }}
		>
			<div aria-hidden="true" className="mymind-wrapped-team-card-back__wash" />
			{shouldRenderContent ? (
				<div className="mymind-wrapped-team-card-back__content">
					<div className="mymind-wrapped-team-card-back__logo-shell">
						<WrappedTeamMemberCardBackLogo className="mymind-wrapped-team-card-back__logo" />
					</div>

					<div className="mymind-wrapped-team-card-back__metrics-shell">
						<table className="mymind-wrapped-team-card-back__metrics-table">
							<tbody>
								{bodyMetrics.map((metric) => (
									<WrappedTeamMemberCardBackMetricRow
										key={metric.label}
										metric={metric}
									/>
								))}
							</tbody>
						</table>
					</div>
					{footerMetric ? (
						<div className="mymind-wrapped-team-card-back__metric-footer-shell">
							<div className="mymind-wrapped-team-card-back__footer-lockup">
								<span className="mymind-wrapped-team-card-back__footer-date">
									{footerMetric.value}
								</span>
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</article>
	);
}

function WrappedTeamMemberCardBackLogo(props: { className?: string }) {
	const { className } = props;

	return (
		<svg
			aria-label="Rudel"
			className={className}
			fill="none"
			role="img"
			viewBox="0 0 1720 1896"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle
				cx="859.946"
				cy="948.44"
				fill="currentColor"
				r="268.025"
				transform="rotate(23.8002 859.946 948.44)"
			/>
			<path
				d="M859.625 537.599C1008.55 537.599 1129.37 417.364 1129.37 268.799C1129.37 120.235 1008.69 0 859.625 0C710.563 0 589.877 120.28 589.877 268.845C589.877 417.364 710.563 537.599 859.625 537.599ZM859.625 1895.24C1008.55 1895.24 1129.37 1774.96 1129.37 1626.4C1129.37 1477.88 1008.69 1357.6 859.625 1357.6C710.563 1357.6 589.877 1477.88 589.877 1626.44C589.877 1774.96 710.563 1895.24 859.625 1895.24ZM269.748 877.021C418.675 877.021 539.496 756.741 539.496 608.176C539.496 459.656 418.765 339.377 269.748 339.377C120.641 339.377 0 459.747 0 608.312C0 756.922 120.641 877.156 269.748 877.156V877.021ZM1449.5 1555.86C1598.43 1555.86 1719.25 1435.58 1719.25 1287.02C1719.25 1138.5 1598.56 1018.22 1449.5 1018.22C1300.44 1018.22 1179.75 1138.5 1179.75 1287.07C1179.75 1435.58 1300.44 1555.86 1449.5 1555.86ZM1449.5 877.021C1598.43 877.021 1719.25 756.741 1719.25 608.176C1719.25 459.702 1598.56 339.422 1449.5 339.422C1300.44 339.422 1179.75 459.702 1179.75 608.221C1179.75 756.741 1300.44 877.021 1449.5 877.021ZM269.748 1555.82C418.675 1555.82 539.496 1435.54 539.496 1286.97C539.496 1138.45 418.765 1018.22 269.748 1018.22C120.641 1018.22 0 1138.73 0 1287.11C0 1435.54 120.641 1555.95 269.748 1555.95V1555.82Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function WrappedTeamMemberCardBackMetricRow(props: {
	metric: WrappedTeamMemberCardBackMetric;
}) {
	const { metric } = props;

	return (
		<tr className="mymind-wrapped-team-card-back__metric-row">
			<th scope="row" className="mymind-wrapped-team-card-back__metric-label">
				{metric.label}
			</th>
			<td className="mymind-wrapped-team-card-back__metric-value">
				<span className="mymind-wrapped-team-card-back__metric-value-text">
					{metric.value}
				</span>
			</td>
		</tr>
	);
}
