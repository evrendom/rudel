import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { WrappedTeamMemberCardTheme } from "./card";

export interface WrappedTeamMemberCardBackHighlight {
	label: string;
	value: string;
}

export type WrappedTeamMemberCardBackVariant = "default" | "gradient-only";

export function WrappedTeamMemberCardBack(props: {
	archetypeLabel: string;
	displayName: string;
	editionLabel: string;
	highlights: readonly WrappedTeamMemberCardBackHighlight[];
	hintLabel: string;
	narrative: string;
	shellClassName?: string;
	shellStyle?: CSSProperties;
	theme?: WrappedTeamMemberCardTheme;
	variant?: WrappedTeamMemberCardBackVariant;
}) {
	const {
		archetypeLabel,
		displayName,
		editionLabel,
		highlights,
		hintLabel,
		narrative,
		shellClassName,
		shellStyle,
		theme = "light",
		variant = "default",
	} = props;
	const isDarkTheme = theme === "dark";
	const isMutedTheme = theme === "muted";
	const shouldRenderContent = variant === "default";

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
			style={shellStyle}
		>
			<div aria-hidden="true" className="mymind-wrapped-team-card-back__wash" />
			{shouldRenderContent ? (
				<div className="mymind-wrapped-team-card-back__content">
					<div className="mymind-wrapped-team-card-back__meta">
						<span className="mymind-wrapped-team-card-back__eyebrow">
							Rudel Wrapped
						</span>
						<span className="mymind-wrapped-team-card-back__edition">
							{editionLabel}
						</span>
					</div>

					<div
						aria-hidden="true"
						className="mymind-wrapped-team-card-back__crest"
					>
						<div className="mymind-wrapped-team-card-back__crest-ring" />
						<div className="mymind-wrapped-team-card-back__crest-mark">
							{getCardBackMonogram(archetypeLabel)}
						</div>
					</div>

					<div className="mymind-wrapped-team-card-back__story">
						<p className="mymind-wrapped-team-card-back__name">{displayName}</p>
						<p className="mymind-wrapped-team-card-back__title">
							{archetypeLabel}
						</p>
						<p className="mymind-wrapped-team-card-back__narrative">
							{narrative}
						</p>
					</div>

					<dl className="mymind-wrapped-team-card-back__highlight-grid">
						{highlights.map((highlight) => (
							<div
								key={highlight.label}
								className="mymind-wrapped-team-card-back__highlight"
							>
								<dt className="mymind-wrapped-team-card-back__highlight-label">
									{highlight.label}
								</dt>
								<dd className="mymind-wrapped-team-card-back__highlight-value">
									{highlight.value}
								</dd>
							</div>
						))}
					</dl>

					<p className="mymind-wrapped-team-card-back__hint">{hintLabel}</p>
				</div>
			) : null}
		</article>
	);
}

function getCardBackMonogram(archetypeLabel: string) {
	const parts = archetypeLabel
		.split(/\s+/)
		.map((part) => part.replace(/[^a-z0-9]/gi, ""))
		.filter(Boolean);

	if (parts.length === 0) {
		return "RW";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "RW";
	}

	return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}
