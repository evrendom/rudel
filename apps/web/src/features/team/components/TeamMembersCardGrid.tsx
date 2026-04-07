import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import { Badge } from "@/app/ui/badge";
import { Card, CardContent } from "@/app/ui/card";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { cn } from "@/lib/utils";

type TeamCardThemeName =
	| "blue"
	| "teal"
	| "orange"
	| "violet"
	| "rose"
	| "slate";

type TeamCardTheme = {
	accentDotClassName: string;
	accentTextClassName: string;
	avatarShellClassName: string;
	cardClassName: string;
	footerLabelClassName: string;
	modelBadgeClassName: string;
	skillBadgeClassName: string;
	statLabelClassName: string;
	statValueClassName: string;
	topGlowClassName: string;
};

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const fallbackThemeOrder = [
	"blue",
	"teal",
	"orange",
	"violet",
	"rose",
] as const;

const teamCardThemes = {
	blue: {
		accentDotClassName: "bg-[#4a7bc9]",
		accentTextClassName: "text-[#315f9e]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#d8e8ff_0%,#9fc0ef_100%)] text-[#24466d]",
		cardClassName:
			"border-[#cfd9ea] bg-[linear-gradient(180deg,#fcfbf8_0%,#f2f6ff_100%)] text-[#252220]",
		footerLabelClassName: "text-[#58729a]",
		modelBadgeClassName:
			"border-[#bfd0f1] bg-white/82 text-[#295ea8] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#bfd0f1] bg-white/74 text-[#315f9e]",
		statLabelClassName: "text-[#5f7bb4]",
		statValueClassName: "text-[#1f3c6d]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(143,183,236,0.52),transparent_68%)]",
	},
	teal: {
		accentDotClassName: "bg-[#2f9e8f]",
		accentTextClassName: "text-[#20786e]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#d7f6ef_0%,#8de0cf_100%)] text-[#174f48]",
		cardClassName:
			"border-[#cce6df] bg-[linear-gradient(180deg,#fbfffe_0%,#ecfbf6_100%)] text-[#252220]",
		footerLabelClassName: "text-[#4b8077]",
		modelBadgeClassName:
			"border-[#b6e2d6] bg-white/82 text-[#187d71] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#b6e2d6] bg-white/74 text-[#20786e]",
		statLabelClassName: "text-[#4e8d80]",
		statValueClassName: "text-[#174f48]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(135,216,199,0.55),transparent_68%)]",
	},
	orange: {
		accentDotClassName: "bg-[#d67d33]",
		accentTextClassName: "text-[#b35d18]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#ffe8d5_0%,#f3bf8d_100%)] text-[#6f3c11]",
		cardClassName:
			"border-[#efd7c4] bg-[linear-gradient(180deg,#fffaf5_0%,#fff0e2_100%)] text-[#252220]",
		footerLabelClassName: "text-[#8b643a]",
		modelBadgeClassName:
			"border-[#f0cdaa] bg-white/82 text-[#bf6419] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#f0cdaa] bg-white/74 text-[#b35d18]",
		statLabelClassName: "text-[#b57a4b]",
		statValueClassName: "text-[#6f3c11]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(242,183,128,0.5),transparent_68%)]",
	},
	violet: {
		accentDotClassName: "bg-[#8b6ddc]",
		accentTextClassName: "text-[#634ea2]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#ece8ff_0%,#ccbdf7_100%)] text-[#4c3977]",
		cardClassName:
			"border-[#d8cff0] bg-[linear-gradient(180deg,#fcfbff_0%,#f1ecff_100%)] text-[#252220]",
		footerLabelClassName: "text-[#736297]",
		modelBadgeClassName:
			"border-[#d8cff0] bg-white/82 text-[#7352d5] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#d8cff0] bg-white/74 text-[#634ea2]",
		statLabelClassName: "text-[#8373aa]",
		statValueClassName: "text-[#4c3977]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(195,178,245,0.52),transparent_68%)]",
	},
	rose: {
		accentDotClassName: "bg-[#d06b87]",
		accentTextClassName: "text-[#ae4c68]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#ffe5ea_0%,#efacbb_100%)] text-[#71364d]",
		cardClassName:
			"border-[#efd3db] bg-[linear-gradient(180deg,#fffafb_0%,#fff0f4_100%)] text-[#252220]",
		footerLabelClassName: "text-[#8c6170]",
		modelBadgeClassName:
			"border-[#f1cad5] bg-white/82 text-[#c24d70] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#f1cad5] bg-white/74 text-[#ae4c68]",
		statLabelClassName: "text-[#b07483]",
		statValueClassName: "text-[#71364d]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(236,158,176,0.5),transparent_68%)]",
	},
	slate: {
		accentDotClassName: "bg-[#79818c]",
		accentTextClassName: "text-[#5f6a78]",
		avatarShellClassName:
			"bg-[linear-gradient(180deg,#e7edf2_0%,#c4cfda_100%)] text-[#43515f]",
		cardClassName:
			"border-[#d7dde5] bg-[linear-gradient(180deg,#fbfcfd_0%,#eef2f6_100%)] text-[#252220]",
		footerLabelClassName: "text-[#697483]",
		modelBadgeClassName:
			"border-[#d3d9e2] bg-white/82 text-[#5e6978] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
		skillBadgeClassName: "border-[#d3d9e2] bg-white/74 text-[#5f6a78]",
		statLabelClassName: "text-[#7a8698]",
		statValueClassName: "text-[#43515f]",
		topGlowClassName:
			"bg-[radial-gradient(circle_at_top_left,rgba(188,199,212,0.55),transparent_68%)]",
	},
} as const satisfies Record<TeamCardThemeName, TeamCardTheme>;

function getAvatarInitials(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "TM";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "TM";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function formatModelLabel(model: string | null) {
	if (!model) {
		return "No model data";
	}

	return model
		.replaceAll(/[-_]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim()
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function formatLastActiveDate(lastActiveDate: string | null) {
	if (!lastActiveDate) {
		return "No recent activity";
	}

	const parsedDate = new Date(lastActiveDate);

	if (Number.isNaN(parsedDate.getTime())) {
		return lastActiveDate;
	}

	return dateFormatter.format(parsedDate);
}

function hashString(value: string) {
	let hash = 0;

	for (const character of value) {
		hash = (hash << 5) - hash + character.charCodeAt(0);
		hash |= 0;
	}

	return Math.abs(hash);
}

function getCardThemeName(row: TeamPageMemberRow): TeamCardThemeName {
	if (!row.hasActivity) {
		return "slate";
	}

	const favoriteModel = row.favoriteModel?.toLowerCase() ?? "";

	if (favoriteModel.includes("opus")) {
		return "orange";
	}

	if (
		favoriteModel.includes("claude") ||
		favoriteModel.includes("sonnet") ||
		favoriteModel.includes("haiku")
	) {
		return "teal";
	}

	if (favoriteModel.includes("gpt") || favoriteModel.includes("codex")) {
		return "blue";
	}

	return fallbackThemeOrder[
		hashString(row.displayName) % fallbackThemeOrder.length
	];
}

function getStatusLabel(row: TeamPageMemberRow) {
	if (!row.hasActivity) {
		return "Idle";
	}

	if (row.activeDays >= 5) {
		return "Hot streak";
	}

	if (row.activeDays >= 2) {
		return "Active";
	}

	return "Started";
}

function TeamMemberCard({ row }: { row: TeamPageMemberRow }) {
	const visibleSkills = row.topSkills.slice(0, 2);
	const hiddenSkillCount = Math.max(
		row.topSkills.length - visibleSkills.length,
		0,
	);
	const theme = teamCardThemes[getCardThemeName(row)];
	const metrics = [
		{ label: "Sessions", value: String(row.totalSessions) },
		{ label: "Days", value: String(row.activeDays) },
		{
			label: "Tokens",
			value: compactNumberFormatter.format(row.totalTokens),
			title: `${row.totalTokens.toLocaleString()} tokens`,
		},
	] as const;

	return (
		<li className="list-none">
			<Card
				size="sm"
				className={cn(
					"relative isolate overflow-hidden rounded-[24px] border shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28),0_1px_0_rgba(255,255,255,0.72)_inset]",
					theme.cardClassName,
				)}
			>
				<div
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-x-0 top-0 h-36",
						theme.topGlowClassName,
					)}
				/>
				<CardContent className="relative flex h-full flex-col gap-5 p-5">
					<div className="flex items-start justify-between gap-3">
						<Badge
							variant="outline"
							className={cn(
								"h-auto border px-2.5 py-1 text-sm font-medium",
								theme.modelBadgeClassName,
							)}
						>
							{formatModelLabel(row.favoriteModel)}
						</Badge>
						<div className="flex items-center gap-2">
							<span
								aria-hidden="true"
								className={cn("size-2 rounded-full", theme.accentDotClassName)}
							/>
							<p
								className={cn("text-sm font-medium", theme.accentTextClassName)}
							>
								{getStatusLabel(row)}
							</p>
						</div>
					</div>

					<div className="flex items-center gap-4">
						<div
							className={cn(
								"rounded-[20px] p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.65)_inset]",
								theme.avatarShellClassName,
							)}
						>
							<Avatar
								size="lg"
								className="size-14 border border-black/10 bg-white/85 shadow-sm"
							>
								{row.imageUrl ? (
									<AvatarImage src={row.imageUrl} alt="" />
								) : null}
								<AvatarFallback className="bg-white/75 text-sm font-semibold text-black/60">
									{getAvatarInitials(row.displayName)}
								</AvatarFallback>
							</Avatar>
						</div>
						<div className="min-w-0">
							<p className="[font-family:var(--dashboard-01-font-roster-mono)] text-[11px] uppercase tracking-[0.16em] text-black/45">
								{row.role}
							</p>
							<h2 className="[font-family:var(--dashboard-01-font-roster-display)] mt-1 truncate text-[28px] font-semibold tracking-[-0.04em] text-balance text-[#252220]">
								{row.displayName}
							</h2>
							<p className="mt-1 truncate text-sm text-black/56">
								{row.email ?? "No email available"}
							</p>
						</div>
					</div>

					<div className="grid grid-cols-3 rounded-[18px] border border-black/8 bg-white/78">
						{metrics.map((metric, index) => (
							<div
								key={`${row.userId}-${metric.label}`}
								className={cn(
									"px-3 py-3",
									index > 0 ? "border-l border-black/8" : undefined,
								)}
								title={metric.title}
							>
								<p
									className={cn(
										"[font-family:var(--dashboard-01-font-roster-mono)] text-[11px] uppercase tracking-[0.16em]",
										theme.statLabelClassName,
									)}
								>
									{metric.label}
								</p>
								<p
									className={cn(
										"mt-2 text-xl font-semibold tracking-[-0.03em]",
										theme.statValueClassName,
									)}
								>
									{metric.value}
								</p>
							</div>
						))}
					</div>

					<div className="space-y-2.5">
						<div className="flex items-center justify-between gap-3">
							<p className="[font-family:var(--dashboard-01-font-roster-mono)] text-[11px] uppercase tracking-[0.16em] text-black/45">
								Top skills
							</p>
							<p className={cn("text-sm", theme.footerLabelClassName)}>
								{formatLastActiveDate(row.lastActiveDate)}
							</p>
						</div>
						{visibleSkills.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{visibleSkills.map((skill) => (
									<Badge
										key={`${row.userId}-${skill.name}`}
										variant="outline"
										className={cn(
											"h-auto border px-2.5 py-1 text-sm font-medium",
											theme.skillBadgeClassName,
										)}
									>
										{skill.name}
										<span className="text-black/45">×{skill.count}</span>
									</Badge>
								))}
								{hiddenSkillCount > 0 ? (
									<Badge
										variant="outline"
										className={cn(
											"h-auto border px-2.5 py-1 text-sm font-medium",
											theme.skillBadgeClassName,
										)}
									>
										+{hiddenSkillCount} more
									</Badge>
								) : null}
							</div>
						) : (
							<p className="text-sm text-black/52">
								No tracked skill breakdown in this range.
							</p>
						)}
					</div>

					<div className="mt-auto flex items-center justify-between gap-3 border-t border-black/8 pt-3">
						<p className={cn("text-sm", theme.footerLabelClassName)}>
							{row.hasActivity
								? `${row.activeDays} active day${row.activeDays === 1 ? "" : "s"} in range`
								: "Waiting for first tracked session"}
						</p>
						<div className="flex items-center gap-2">
							<span
								aria-hidden="true"
								className={cn("size-2 rounded-full", theme.accentDotClassName)}
							/>
							<p className="text-sm font-medium text-[#252220]">
								{row.hasActivity ? "Tracked" : "Quiet"}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</li>
	);
}

export function TeamMembersCardGrid({ rows }: { rows: TeamPageMemberRow[] }) {
	return (
		<ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{rows.map((row) => (
				<TeamMemberCard key={row.userId} row={row} />
			))}
		</ul>
	);
}
