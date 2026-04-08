import type { TeamCardTone } from "@/features/team/data/team-card-types";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { cn } from "@/lib/utils";

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const paceNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
});

const adaptedTeamCardShellClassName =
	"team-lineup-featured-card relative isolate flex h-[358px] w-[233px] flex-col overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,#fcfbf8_0%,#f4eee7_100%)] px-[14px] pt-[15px] pb-[10px] text-[#302d2b] shadow-[0_0_10.1px_rgba(0,0,0,0.1)]";

const adaptedTeamCardHeaderValueClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[17.07px] font-extrabold leading-none tracking-[-0.01em] tabular-nums text-[#272423]";

const adaptedTeamCardHeaderLabelClassName =
	"ml-[5px] text-[10px] font-semibold leading-none tracking-[-0.03em]";

const adaptedTeamCardRoleClassName =
	"text-[12.36px] font-medium leading-none text-[#5d5955]";

const adaptedTeamCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[19px] font-extrabold leading-[0.9] tracking-[-0.02em] text-[#252220]";

const adaptedTeamCardSubtitleClassName =
	"mt-[8px] truncate text-[16px] font-medium leading-[0.92] tracking-[-0.02em] text-[#5f5a57]";

const adaptedTeamCardFootnoteClassName =
	"mt-[6px] truncate text-[10px] font-medium uppercase tracking-[0.12em] text-black/40";

const adaptedTeamCardMediaPanelClassName =
	"team-lineup-featured-media-panel mt-[12px] h-[158px] w-full rounded-[14px] border border-black/8 bg-[#f6f4ef]/74";

const adaptedTeamCardStatsPanelClassName =
	"team-lineup-featured-stats-panel mt-auto h-[96px] w-full rounded-[14px] border border-black/8 bg-[#f6f4ef]/78";

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[10px] px-[12px] py-[10px]";

const portraitPlaceholderInitialsClassName =
	"text-[54px] font-extrabold leading-none tracking-[-0.08em] text-black/66";

const toneAccentClassNames = {
	blue: "text-[#295ea8]",
	teal: "text-[#187d71]",
	orange: "text-[#bf6419]",
	lime: "text-[#5f8f1d]",
	violet: "text-[#7352d5]",
	rose: "text-[#c24d70]",
	slate: "text-[#5e6978]",
} as const satisfies Record<TeamCardTone, string>;

const tonePortraitClassNames = {
	blue: "bg-[linear-gradient(180deg,#d8e8ff_0%,#8fb7ec_100%)] text-[#24466d]",
	teal: "bg-[linear-gradient(180deg,#d7f6ef_0%,#87d8c7_100%)] text-[#174f48]",
	orange: "bg-[linear-gradient(180deg,#ffe8d5_0%,#f2b780_100%)] text-[#6f3c11]",
	lime: "bg-[linear-gradient(180deg,#ecf7d0_0%,#b6db72_100%)] text-[#475d1d]",
	violet: "bg-[linear-gradient(180deg,#ece8ff_0%,#c3b2f5_100%)] text-[#4c3977]",
	rose: "bg-[linear-gradient(180deg,#ffe5ea_0%,#ec9eb0_100%)] text-[#71364d]",
	slate: "bg-[linear-gradient(180deg,#e7edf2_0%,#bcc7d4_100%)] text-[#43515f]",
} as const satisfies Record<TeamCardTone, string>;

type TeamCardStatRow = {
	label: string;
	title?: string;
	value: string;
};

type TeamCardStatColumn = {
	id: "left" | "right";
	rows: TeamCardStatRow[];
};

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

function formatModelShort(model: string | null) {
	if (!model) {
		return "None";
	}

	const normalizedModel = model.trim().toLowerCase();

	if (normalizedModel.includes("opus")) {
		return "Opus";
	}

	if (normalizedModel.includes("sonnet")) {
		return "Sonnet";
	}

	if (normalizedModel.includes("haiku")) {
		return "Haiku";
	}

	if (normalizedModel.includes("codex")) {
		return "Codex";
	}

	if (normalizedModel.includes("gpt")) {
		return "GPT";
	}

	if (normalizedModel.includes("gemini")) {
		return "Gemini";
	}

	return model.split(/[\s/_-]+/)[0] ?? "Model";
}

function formatTopSkill(
	row: Pick<TeamPageMemberRow, "topSkills" | "totalSessions">,
) {
	const topSkill = row.topSkills[0];

	if (topSkill) {
		return {
			count: topSkill.count,
			title: `${topSkill.name} ×${topSkill.count}`,
			value: topSkill.name,
		} as const;
	}

	if (row.totalSessions > 0) {
		return {
			count: 0,
			title: "No tracked skill breakdown in this range.",
			value: "skill issue",
		} as const;
	}

	return {
		count: 0,
		title: "No traced sessions yet.",
		value: "None",
	} as const;
}

function formatShortDate(lastActiveDate: string | null) {
	if (!lastActiveDate) {
		return "None";
	}

	const parsedDate = new Date(lastActiveDate);

	if (Number.isNaN(parsedDate.getTime())) {
		return lastActiveDate;
	}

	return shortDateFormatter.format(parsedDate);
}

function formatAverageTokens(totalTokens: number, totalSessions: number) {
	if (totalSessions <= 0) {
		return "0";
	}

	return compactNumberFormatter.format(totalTokens / totalSessions);
}

function formatSessionPace(totalSessions: number, activeDays: number) {
	if (totalSessions <= 0 || activeDays <= 0) {
		return "0";
	}

	return paceNumberFormatter.format(totalSessions / activeDays);
}

function getCardTone(row: TeamPageMemberRow): TeamCardTone {
	if (!row.hasActivity) {
		return "slate";
	}

	if (row.totalSessions > 0 && row.topSkills.length === 0) {
		return "rose";
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

	return "rose";
}

function getCardStatus(row: TeamPageMemberRow) {
	if (row.totalSessions > 0 && row.topSkills.length === 0) {
		return "skill issue";
	}

	if (!row.hasActivity) {
		return "quiet";
	}

	if (row.totalTokens >= 1_000_000 || row.totalSessions >= 100) {
		return "power user";
	}

	if (row.activeDays >= 20) {
		return "steady";
	}

	return "tracked";
}

function getPortraitNote(row: TeamPageMemberRow) {
	const topSkill = formatTopSkill(row);

	if (topSkill.count > 0) {
		return `Top skill · ${topSkill.value}`;
	}

	if (row.totalSessions > 0) {
		return "No tracked skills";
	}

	return "No traced sessions yet";
}

function buildCardStats(row: TeamPageMemberRow): TeamCardStatColumn[] {
	const topSkill = formatTopSkill(row);

	return [
		{
			id: "left",
			rows: [
				{
					label: "SESS",
					title: `${row.totalSessions.toLocaleString()} sessions`,
					value: row.totalSessions.toLocaleString(),
				},
				{
					label: "DAYS",
					title: `${row.activeDays.toLocaleString()} active days`,
					value: row.activeDays.toLocaleString(),
				},
				{
					label: "AVG",
					title:
						row.totalSessions > 0
							? `${Math.round(row.totalTokens / row.totalSessions).toLocaleString()} average tokens per session`
							: "No traced sessions yet.",
					value: formatAverageTokens(row.totalTokens, row.totalSessions),
				},
				{
					label: "PACE",
					title:
						row.activeDays > 0
							? `${formatSessionPace(row.totalSessions, row.activeDays)} sessions per active day`
							: "No active days yet.",
					value: formatSessionPace(row.totalSessions, row.activeDays),
				},
			],
		},
		{
			id: "right",
			rows: [
				{
					label: "MODEL",
					title: formatModelLabel(row.favoriteModel),
					value: formatModelShort(row.favoriteModel),
				},
				{
					label: "SKILL",
					title: topSkill.title,
					value: topSkill.value,
				},
				{
					label: "USES",
					title:
						topSkill.count > 0
							? `${topSkill.count.toLocaleString()} sessions tagged with ${topSkill.value}`
							: "No tracked skill counts yet.",
					value: topSkill.count.toLocaleString(),
				},
				{
					label: "LAST",
					title: row.lastActiveDate ?? "No recent activity",
					value: formatShortDate(row.lastActiveDate),
				},
			],
		},
	];
}

function TeamCardStatsColumn({ column }: { column: TeamCardStatColumn }) {
	return (
		<div
			className={cn(
				"flex flex-col justify-between gap-[8px]",
				column.id === "right" ? "items-end" : undefined,
			)}
		>
			{column.rows.map((row) => (
				<div
					key={`${column.id}-${row.label}`}
					className={cn(
						"flex min-w-0 items-baseline gap-[10px]",
						column.id === "right" ? "justify-end" : undefined,
					)}
					title={row.title}
				>
					<div className="max-w-[74px] truncate leading-none tracking-[-0.02em] tabular-nums text-[#272423]">
						{row.value}
					</div>
					<div className="shrink-0 leading-none tracking-[0.08em] text-black/42">
						{row.label}
					</div>
				</div>
			))}
		</div>
	);
}

function TeamMemberCard({ row }: { row: TeamPageMemberRow }) {
	const tone = getCardTone(row);
	const status = getCardStatus(row);
	const stats = buildCardStats(row);
	const displayModel = formatModelLabel(row.favoriteModel);
	const initials = getAvatarInitials(row.displayName);
	const topHeaderValue = compactNumberFormatter.format(row.totalTokens);
	const portraitNote = getPortraitNote(row);

	return (
		<li className="list-none">
			<article className={adaptedTeamCardShellClassName}>
				<div className="flex items-center justify-between">
					<div
						className="flex items-center"
						title={`${row.totalTokens.toLocaleString()} total tokens`}
					>
						<div className={adaptedTeamCardHeaderValueClassName}>
							{topHeaderValue}
						</div>
						<div
							className={cn(
								adaptedTeamCardHeaderLabelClassName,
								toneAccentClassNames[tone],
							)}
						>
							TOKENS
						</div>
					</div>
					<div className={adaptedTeamCardRoleClassName}>{row.role}</div>
				</div>

				<div className={adaptedTeamCardMediaPanelClassName}>
					<div
						className={cn(portraitPanelClassName, tonePortraitClassNames[tone])}
					>
						<div className="relative z-10 flex items-start justify-between gap-3">
							<div
								className={cn(
									"text-[10px] font-semibold uppercase tracking-[0.16em]",
									toneAccentClassNames[tone],
								)}
							>
								{status}
							</div>
							<div className="flex size-[28px] items-center justify-center rounded-full bg-white/68 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/65">
								{initials}
							</div>
						</div>

						{row.imageUrl ? (
							<>
								<img
									src={row.imageUrl}
									alt={row.displayName}
									className="absolute inset-0 h-full w-full object-cover object-center"
								/>
								<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%,rgba(0,0,0,0.18)_100%)]" />
								<div className="relative z-10 flex-1" />
							</>
						) : (
							<div className="flex flex-1 items-center justify-center">
								<div className={portraitPlaceholderInitialsClassName}>
									{initials}
								</div>
							</div>
						)}

						<div className="relative z-10 text-[11px] font-medium uppercase tracking-[0.12em] text-black/56">
							{portraitNote}
						</div>
					</div>
				</div>

				<div className="mt-[16px] px-[3px] text-center">
					<div className={adaptedTeamCardNameClassName}>{row.displayName}</div>
					<div className={adaptedTeamCardSubtitleClassName} title={displayModel}>
						{displayModel}
					</div>
					<div
						className={adaptedTeamCardFootnoteClassName}
						title={row.email ? `All-time · ${row.email}` : "All-time teammate card"}
					>
						{row.email ? `All-time · ${row.email}` : "All-time teammate card"}
					</div>
				</div>

				<div className={adaptedTeamCardStatsPanelClassName}>
					<div className="team-lineup-featured-stats-panel__content grid h-full grid-cols-[max-content_max-content] justify-between px-[16px] py-[12px] [font-family:var(--dashboard-01-font-roster-mono)] text-[11px] font-normal text-[#4b4d49]">
						{stats.map((column) => (
							<TeamCardStatsColumn key={column.id} column={column} />
						))}
					</div>
				</div>
			</article>
		</li>
	);
}

export function TeamMembersCardGrid({ rows }: { rows: TeamPageMemberRow[] }) {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-items-center gap-y-4 sm:grid-cols-2 sm:gap-x-5 xl:grid-cols-3 xl:gap-x-4">
				{rows.map((row) => (
					<TeamMemberCard key={row.userId} row={row} />
				))}
			</ul>
		</div>
	);
}
