import type { ReactNode } from "react";
import workspaceIcon from "@/features/team/assets/team-lineup-workspace-icon-v5.png";
import type {
	TeamCardTone,
	TeamPlayerCardData,
} from "@/features/team/data/team-card-types";
import { cn } from "@/lib/utils";

const featuredMediaRailSlots = ["workspace", "model", "language"] as const;

const roleModelCardShellClassName =
	"team-lineup-featured-card relative isolate flex h-[358px] w-[233px] flex-col overflow-hidden rounded-[18px] px-[14px] pt-[15px] pb-[10px] text-[#302d2b] shadow-[0_0_10.1px_rgba(0,0,0,0.1)]";

const roleModelCardHeaderValueClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[17.07px] font-extrabold leading-none tracking-[-0.01em] tabular-nums";

const roleModelCardHeaderLabelClassName =
	"text-[10px] font-semibold leading-none tracking-[-0.03em]";

const roleModelCardRoleClassName = "text-[12.36px] font-medium leading-none";

const roleModelCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[19px] font-extrabold leading-[0.9] tracking-[-0.02em]";

const roleModelCardTitleClassName =
	"mt-[8px] text-[18px] font-medium leading-[0.92] tracking-[-0.02em]";

const mediaPanelContentClassName =
	"team-lineup-featured-media-panel__content flex h-full gap-[10px] p-[10px]";

const mediaRailClassName =
	"flex w-[42px] flex-col items-center justify-center gap-[11px]";

const mediaTileClassName =
	"flex size-[31px] items-center justify-center rounded-[9px]";

const neutralMediaTileClassName = cn(mediaTileClassName, "bg-[#f6f4ef]");

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[10px] px-[12px] py-[10px]";

const portraitPanelArchetypeClassName =
	"text-[10px] font-semibold uppercase tracking-[0.16em]";

const portraitPanelSubtitleClassName =
	"text-[11px] font-medium uppercase tracking-[0.12em]";

const portraitPlaceholderInitialsClassName =
	"text-[42px] font-extrabold leading-none tracking-[-0.06em]";

const rosterAccentClassNames = {
	blue: "text-[#4a7bc9]",
	teal: "text-[#2f9e8f]",
	orange: "text-[#d67d33]",
	lime: "text-[#84b13b]",
	violet: "text-[#8b6ddc]",
	rose: "text-[#d06b87]",
	slate: "text-[#79818c]",
} as const satisfies Record<TeamCardTone, string>;

const rosterRailTileClassNames = {
	blue: "bg-[linear-gradient(180deg,#deebff_0%,#9ec5fe_100%)] text-[#295ea8]",
	teal: "bg-[linear-gradient(180deg,#d3faf4_0%,#8ce6d7_100%)] text-[#187d71]",
	orange: "bg-[linear-gradient(180deg,#ffeedb_0%,#fdc27e_100%)] text-[#bf6419]",
	lime: "bg-[linear-gradient(180deg,#effad4_0%,#c7eb7c_100%)] text-[#5f8f1d]",
	violet: "bg-[linear-gradient(180deg,#efebff_0%,#ccbfff_100%)] text-[#7352d5]",
	rose: "bg-[linear-gradient(180deg,#ffe7eb_0%,#f9b5bf_100%)] text-[#c24d70]",
	slate: "bg-[linear-gradient(180deg,#edf1f5_0%,#cfd7e1_100%)] text-[#5e6978]",
} as const satisfies Record<TeamCardTone, string>;

const rosterPortraitPanelClassNames = {
	blue: "bg-[linear-gradient(180deg,#d8e8ff_0%,#8fb7ec_100%)] text-[#24466d]",
	teal: "bg-[linear-gradient(180deg,#d7f6ef_0%,#87d8c7_100%)] text-[#174f48]",
	orange: "bg-[linear-gradient(180deg,#ffe8d5_0%,#f2b780_100%)] text-[#6f3c11]",
	lime: "bg-[linear-gradient(180deg,#ecf7d0_0%,#b6db72_100%)] text-[#475d1d]",
	violet: "bg-[linear-gradient(180deg,#ece8ff_0%,#c3b2f5_100%)] text-[#4c3977]",
	rose: "bg-[linear-gradient(180deg,#ffe5ea_0%,#ec9eb0_100%)] text-[#71364d]",
	slate: "bg-[linear-gradient(180deg,#e7edf2_0%,#bcc7d4_100%)] text-[#43515f]",
} as const satisfies Record<TeamCardTone, string>;

const rosterCardShellClassNames = {
	blue: "bg-[linear-gradient(180deg,#fcfbf8_0%,#f4eee7_100%)]",
	teal: "bg-[linear-gradient(180deg,#39E5E7_0%,#35E895_50.96%,#7AE762_100%)]",
	orange: "bg-[#DEFDEB]",
	lime: "bg-[#FEE9F4]",
	violet: "bg-[#4F3A5A]",
	rose: "bg-[#FEE9F4]",
	slate: "bg-[linear-gradient(180deg,#39E5E7_0%,#35E895_50.96%,#7AE762_100%)]",
} as const satisfies Record<TeamCardTone, string>;

const featuredShellTextClassNames = {
	value: "text-[#faf3ff]",
	accent: "text-[#e9d7ff]",
	role: "text-white/72",
	name: "text-[#faf3ff]",
	title: "text-white/72",
} as const;

const defaultShellTextClassNames = {
	value: "text-[#272423]",
	role: "text-[#5d5955]",
	name: "text-[#252220]",
	title: "text-[#5f5a57]",
} as const;

type FeaturedPanelOffset = {
	left: number;
	top: number;
};

type FeaturedSharedSurfaceLayout = {
	cardWidth: number;
	cardHeight: number;
	media: FeaturedPanelOffset;
	stats: FeaturedPanelOffset;
};

type RoleModelCardStats = ReadonlyArray<{
	id: "left" | "right";
	rows: ReadonlyArray<readonly [string, string]>;
}>;

// The featured card shell uses fixed dimensions and panel spacing, so the
// shared surface offsets can stay static instead of being measured on mount.
const featuredSharedSurfaceLayout: FeaturedSharedSurfaceLayout = {
	cardWidth: 233,
	cardHeight: 358,
	media: {
		left: 14,
		top: 44,
	},
	stats: {
		left: 14,
		top: 273,
	},
};

export function TeamPlayerCard({
	player,
	className,
}: {
	player: TeamPlayerCardData;
	className?: string;
}) {
	if (player.featured) {
		return <FeaturedTeamPlayerCard player={player} className={className} />;
	}

	return <DefaultTeamPlayerCard player={player} className={className} />;
}

function FeaturedTeamPlayerCard({
	player,
	className,
}: {
	player: TeamPlayerCardData;
	className?: string;
}) {
	return (
		<RoleModelTeamPlayerCardFrame
			className={className}
			overall={String(player.overall)}
			accentText={player.archetype}
			accentClassName={rosterAccentClassNames[player.badgeTone]}
			topLabel={player.role}
			displayName={player.name}
			displayTitle={player.subtitle}
			stats={buildRoleModelStats(player.stats)}
			mediaContent={
				<div className={mediaPanelContentClassName}>
					<FeaturedMediaRail />
					<div className="min-w-0 flex-1">
						<FeaturedPlayerPortrait player={player} />
					</div>
				</div>
			}
		/>
	);
}

function DefaultTeamPlayerCard({
	player,
	className,
}: {
	player: TeamPlayerCardData;
	className?: string;
}) {
	return (
		<RoleModelTeamPlayerCardFrame
			className={className}
			darkShell={(player.shellTone ?? player.badgeTone) === "violet"}
			overall={String(player.overall)}
			accentText={player.archetype}
			accentClassName={rosterAccentClassNames[player.badgeTone]}
			shellClassName={
				rosterCardShellClassNames[player.shellTone ?? player.badgeTone]
			}
			topLabel={player.role}
			displayName={player.name}
			displayTitle={player.subtitle}
			stats={buildRoleModelStats(player.stats)}
			mediaContent={<DefaultTeamPlayerCardMedia player={player} />}
		/>
	);
}

function FeaturedMediaRail() {
	return (
		<div className={mediaRailClassName}>
			{featuredMediaRailSlots.map((slot) => (
				<div key={slot} className={neutralMediaTileClassName}>
					{slot === "workspace" ? (
						<div className="size-[31px] overflow-hidden rounded-[5px] bg-black">
							<img
								src={workspaceIcon}
								alt=""
								aria-hidden="true"
								className="block size-full object-cover"
							/>
						</div>
					) : (
						<div className="size-[11px] rounded-[3px] bg-[#cac7c1]" />
					)}
				</div>
			))}
		</div>
	);
}

function FeaturedPlayerPortrait({ player }: { player: TeamPlayerCardData }) {
	if (player.portraitImageSrc) {
		return (
			<img
				src={player.portraitImageSrc}
				alt={player.name}
				className="h-full w-full overflow-hidden rounded-[10px] bg-[linear-gradient(180deg,#d1cdc6_0%,#9a958f_100%)] object-cover object-center"
			/>
		);
	}

	return (
		<div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-[linear-gradient(180deg,#d8e8ff_0%,#f3efe7_100%)]">
			<div className="text-[54px] font-extrabold leading-none tracking-[-0.08em] text-black/65">
				{player.badgeInitials}
			</div>
		</div>
	);
}

function DefaultMediaRail({
	badgeInitials,
	badgeTone,
}: Pick<TeamPlayerCardData, "badgeInitials" | "badgeTone">) {
	return (
		<div className={mediaRailClassName}>
			<div
				className={cn(
					mediaTileClassName,
					"text-[10px] font-semibold uppercase tracking-[0.08em]",
					rosterRailTileClassNames[badgeTone],
				)}
			>
				{badgeInitials}
			</div>
			<NeutralRectangleTile />
			<NeutralCapsuleTile />
		</div>
	);
}

function NeutralRectangleTile() {
	return (
		<div className={neutralMediaTileClassName}>
			<div className="h-[11px] w-[13px] rounded-[3px] bg-[#d3d0ca]" />
		</div>
	);
}

function NeutralCapsuleTile() {
	return (
		<div className={neutralMediaTileClassName}>
			<div className="h-[11px] w-[13px] rounded-[999px] bg-[#d3d0ca]" />
		</div>
	);
}

function PortraitPanel({
	badgeInitials,
	badgeTone,
	archetype,
	archetypeClassName,
	children,
	className,
	initialsBadgeClassName,
	subtitle,
	subtitleClassName,
}: {
	badgeInitials: string;
	badgeTone: TeamCardTone;
	archetype: string;
	archetypeClassName?: string;
	children: ReactNode;
	className?: string;
	initialsBadgeClassName?: string;
	subtitle: string;
	subtitleClassName?: string;
}) {
	return (
		<div
			className={cn(
				portraitPanelClassName,
				rosterPortraitPanelClassNames[badgeTone],
				className,
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div
					className={cn(portraitPanelArchetypeClassName, archetypeClassName)}
				>
					{archetype}
				</div>
				<div
					className={cn(
						"flex size-[28px] items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]",
						initialsBadgeClassName,
					)}
				>
					{badgeInitials}
				</div>
			</div>

			{children}

			<div className={cn(portraitPanelSubtitleClassName, subtitleClassName)}>
				{subtitle}
			</div>
		</div>
	);
}

function RoleModelTeamPlayerCardFrame({
	className,
	darkShell,
	overall,
	accentText,
	accentClassName,
	shellClassName,
	topLabel,
	displayName,
	displayTitle,
	stats,
	mediaContent,
}: {
	className?: string;
	darkShell?: boolean;
	overall: string;
	accentText: string;
	accentClassName: string;
	shellClassName?: string;
	topLabel: string;
	displayName: string;
	displayTitle: string;
	stats: RoleModelCardStats;
	mediaContent: ReactNode;
}) {
	return (
		<article
			className={cn(roleModelCardShellClassName, shellClassName, className)}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					<div
						className={cn(
							roleModelCardHeaderValueClassName,
							darkShell
								? featuredShellTextClassNames.value
								: defaultShellTextClassNames.value,
						)}
					>
						{overall}
					</div>
					<div
						className={cn(
							"ml-[5px]",
							roleModelCardHeaderLabelClassName,
							darkShell ? featuredShellTextClassNames.accent : accentClassName,
						)}
					>
						{accentText}
					</div>
				</div>
				<div
					className={cn(
						roleModelCardRoleClassName,
						darkShell
							? featuredShellTextClassNames.role
							: defaultShellTextClassNames.role,
					)}
				>
					{topLabel}
				</div>
			</div>

			<div className="team-lineup-featured-media-panel mt-[12px] h-[158px] w-full rounded-[14px]">
				<FeaturedSharedSurfaceFragment
					cardHeight={featuredSharedSurfaceLayout.cardHeight}
					cardWidth={featuredSharedSurfaceLayout.cardWidth}
					offsetLeft={featuredSharedSurfaceLayout.media.left}
					offsetTop={featuredSharedSurfaceLayout.media.top}
				/>
				{mediaContent}
			</div>

			<div className="mt-[16px] px-[3px] text-center">
				<div
					className={cn(
						roleModelCardNameClassName,
						darkShell
							? featuredShellTextClassNames.name
							: defaultShellTextClassNames.name,
					)}
				>
					{displayName}
				</div>
				<div
					className={cn(
						roleModelCardTitleClassName,
						darkShell
							? featuredShellTextClassNames.title
							: defaultShellTextClassNames.title,
					)}
				>
					{displayTitle}
				</div>
			</div>

			<div className="team-lineup-featured-stats-panel mt-auto h-[75px] w-full rounded-[14px]">
				<FeaturedSharedSurfaceFragment
					cardHeight={featuredSharedSurfaceLayout.cardHeight}
					cardWidth={featuredSharedSurfaceLayout.cardWidth}
					offsetLeft={featuredSharedSurfaceLayout.stats.left}
					offsetTop={featuredSharedSurfaceLayout.stats.top}
				/>
				<div className="team-lineup-featured-stats-panel__content grid h-full grid-cols-[max-content_max-content] justify-between px-[22px] py-[11px] [font-family:var(--dashboard-01-font-roster-mono)] text-[17px] font-normal text-[#4b4d49]">
					{stats.map((column) => (
						<div
							key={column.id}
							className={cn(
								"flex flex-col justify-between",
								column.id === "right" ? "items-end" : undefined,
							)}
						>
							{column.rows.map(([value, label]) => (
								<div
									key={label}
									className={cn(
										"flex items-baseline gap-[12px]",
										column.id === "right" ? "justify-end" : undefined,
									)}
								>
									<div className="leading-none tracking-[-0.02em] tabular-nums">
										{value}
									</div>
									<div className="leading-none tracking-[-0.03em]">{label}</div>
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</article>
	);
}

function DefaultTeamPlayerCardMedia({
	player,
}: {
	player: TeamPlayerCardData;
}) {
	if (player.portraitImageSrc) {
		return (
			<div className={mediaPanelContentClassName}>
				<DefaultMediaRail
					badgeInitials={player.badgeInitials}
					badgeTone={player.badgeTone}
				/>
				<div className="min-w-0 flex-1">
					<PortraitPanel
						archetype={player.archetype}
						archetypeClassName="text-black/50"
						badgeInitials={player.badgeInitials}
						badgeTone={player.badgeTone}
						initialsBadgeClassName="bg-white/72 text-black/65"
						subtitle={player.subtitle}
						subtitleClassName="text-black/55"
					>
						<img
							src={player.portraitImageSrc}
							alt={player.name}
							className="absolute inset-0 h-full w-full object-cover object-center"
						/>
						<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%,rgba(0,0,0,0.16)_100%)]" />

						<div className="relative z-10 flex-1" />
					</PortraitPanel>
				</div>
			</div>
		);
	}

	return (
		<div className={mediaPanelContentClassName}>
			<DefaultMediaRail
				badgeInitials={player.badgeInitials}
				badgeTone={player.badgeTone}
			/>
			<div className="min-w-0 flex-1">
				<PortraitPanel
					archetype={player.archetype}
					archetypeClassName="text-black/45"
					badgeInitials={player.badgeInitials}
					badgeTone={player.badgeTone}
					initialsBadgeClassName="bg-white/65 text-black/60"
					subtitle={player.subtitle}
					subtitleClassName="text-black/45"
				>
					<div className="flex flex-1 items-center justify-center">
						<div
							className={cn(
								portraitPlaceholderInitialsClassName,
								"text-black/66",
							)}
						>
							{player.badgeInitials}
						</div>
					</div>
				</PortraitPanel>
			</div>
		</div>
	);
}

function buildRoleModelStats(
	stats: TeamPlayerCardData["stats"],
): RoleModelCardStats {
	return [
		{
			id: "left",
			rows: [
				[String(stats.OUT), "OUT"],
				[String(stats.SPD), "SPE"],
				[String(stats.CRA), "CRA"],
			],
		},
		{
			id: "right",
			rows: [
				[String(stats.QUA), "QUA"],
				[String(stats.EFF), "EFF"],
				[String(stats.CON), "CON"],
			],
		},
	];
}

function FeaturedSharedSurfaceFragment({
	cardHeight,
	cardWidth,
	offsetLeft,
	offsetTop,
}: {
	cardHeight: number;
	cardWidth: number;
	offsetLeft: number;
	offsetTop: number;
}) {
	return (
		<div
			aria-hidden="true"
			className="team-lineup-featured-shared-surface"
			style={{
				height: cardHeight,
				transform: `translate(${-offsetLeft}px, ${-offsetTop}px)`,
				width: cardWidth,
			}}
		>
			{/* Hidden for now: the lattice overlay regressed frontend performance on the team screen. */}
			<div className="team-lineup-featured-shared-surface__noise-large" />
			<div className="team-lineup-featured-shared-surface__noise-small" />
		</div>
	);
}
