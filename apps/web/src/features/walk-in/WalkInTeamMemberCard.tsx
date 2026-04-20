import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import type { TeamCardTone } from "@/features/team/data/team-card-types";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import statSectionTextureWebp from "@/features/walk-in/assets/team-card-stat-texture.webp";
import { cn } from "@/lib/utils";

const CARD_RENDER_SCALE_VAR = "var(--walk-in-card-render-scale, 1)";

const adaptedTeamCardShellClassName =
	"team-lineup-featured-card relative isolate flex flex-col overflow-hidden bg-[linear-gradient(180deg,#fbfcfe_0%,#f0f3f7_100%)] text-[#302d2b]";

const adaptedTeamCardHeaderValueClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] font-extrabold leading-none tracking-[-0.01em] tabular-nums text-[#272423]";

const adaptedTeamCardHeaderLabelClassName =
	"font-semibold leading-none tracking-[-0.03em] text-[#272423]";

const adaptedTeamCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] font-extrabold leading-[0.9] tracking-[-0.02em] text-[#252220]";

const adaptedTeamCardMediaPanelClassName =
	"team-lineup-featured-media-panel border border-black/8 bg-white/86";

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden";

const portraitPlaceholderInitialsClassName =
	"font-extrabold leading-none tracking-[-0.08em] text-black/66";

const STAT_SURFACE_BLEED_PX = 10;

const statSectionSurfaceStyle = {
	"--walk-in-team-card-stat-surface-texture": `url(${statSectionTextureWebp})`,
} as CSSProperties;

const tonePortraitClassNames = {
	blue: "bg-[linear-gradient(180deg,#d8e8ff_0%,#8fb7ec_100%)] text-[#24466d]",
	teal: "bg-[linear-gradient(180deg,#d7f6ef_0%,#87d8c7_100%)] text-[#174f48]",
	orange: "bg-[linear-gradient(180deg,#ffe8d5_0%,#f2b780_100%)] text-[#6f3c11]",
	lime: "bg-[linear-gradient(180deg,#ecf7d0_0%,#b6db72_100%)] text-[#475d1d]",
	violet: "bg-[linear-gradient(180deg,#ece8ff_0%,#c3b2f5_100%)] text-[#4c3977]",
	rose: "bg-[linear-gradient(180deg,#ffe5ea_0%,#ec9eb0_100%)] text-[#71364d]",
	slate: "bg-[linear-gradient(180deg,#e7edf2_0%,#bcc7d4_100%)] text-[#43515f]",
} as const satisfies Record<TeamCardTone, string>;

export interface WalkInTeamMemberCardHeaderMetric {
	label?: string;
	title?: string;
	value: string;
}

export type WalkInTeamMemberCardTheme = "dark" | "light" | "muted";
export type WalkInTeamMemberCardLayoutPreset = "default" | "team-card-preview";

export interface WalkInTeamMemberCardStatItem {
	icon?: "claude" | "codex";
	key: string;
	label?: string;
	title?: string;
	value: string;
}

export interface WalkInTeamMemberCardStatLayerOpacities {
	hideTextureImage?: boolean;
	maskTint?: "black" | "white";
	rainbowShineOpacity: number;
	textTone?: "default" | "muted-white";
	tileBorderOpacity: number;
	tileFillOpacity: number;
	tileInsetShadowOpacity: number;
	tileTopStrokeOpacity: number;
	textureOpacity: number;
	whiteMaskOpacity?: number;
}

const DEFAULT_STAT_LAYER_OPACITIES: WalkInTeamMemberCardStatLayerOpacities = {
	hideTextureImage: false,
	maskTint: "white",
	rainbowShineOpacity: 0.38,
	textTone: "default",
	tileBorderOpacity: 1,
	tileFillOpacity: 0.04,
	tileInsetShadowOpacity: 0.53,
	tileTopStrokeOpacity: 0.1,
	textureOpacity: 1,
	whiteMaskOpacity: undefined,
};

interface WalkInTeamMemberCardStatSurfaceStyle extends CSSProperties {
	"--walk-in-team-card-stat-surface-position"?: string;
	"--walk-in-team-card-stat-surface-size"?: string;
}

export function WalkInTeamMemberCard(props: {
	headerLeftMetric?: WalkInTeamMemberCardHeaderMetric;
	headerRightMetric?: WalkInTeamMemberCardHeaderMetric;
	layoutPreset?: WalkInTeamMemberCardLayoutPreset;
	mediaPanelClassName?: string;
	mediaOverlayClassName?: string;
	row: TeamPageMemberRow;
	shellClassName?: string;
	shellStyle?: CSSProperties;
	statLayerOpacities?: WalkInTeamMemberCardStatLayerOpacities;
	statItems: readonly WalkInTeamMemberCardStatItem[];
	statTileClassName?: string;
	theme?: WalkInTeamMemberCardTheme;
}) {
	const {
		headerLeftMetric,
		headerRightMetric,
		layoutPreset = "default",
		mediaPanelClassName,
		mediaOverlayClassName,
		row,
		shellClassName,
		shellStyle,
		statLayerOpacities = DEFAULT_STAT_LAYER_OPACITIES,
		statItems,
		statTileClassName,
		theme = "light",
	} = props;
	const tone = getCardTone(row);
	const effectiveTone = row.imageUrl ? tone : "rose";
	const initials = getAvatarInitials(row.displayName);
	const isDarkTheme = theme === "dark";
	const isMutedTheme = theme === "muted";
	const statSectionRef = useRef<HTMLDivElement | null>(null);
	const statTileRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const [statSurfaceStyles, setStatSurfaceStyles] = useState<
		Record<string, WalkInTeamMemberCardStatSurfaceStyle>
	>({});
	const borderLayerOpacity = statLayerOpacities.tileBorderOpacity;
	const statTextUsesMutedWhite = statLayerOpacities.textTone === "muted-white";
	const usesTeamCardPreviewLayout = layoutPreset === "team-card-preview";
	const whiteMaskOpacity =
		statLayerOpacities.whiteMaskOpacity ??
		1 - statLayerOpacities.textureOpacity;
	const maskRgb =
		statLayerOpacities.maskTint === "black" ? "0 0 0" : "255 255 255";
	const statTileLayerStyle: CSSProperties = {
		backgroundColor: `rgb(255 255 255 / ${statLayerOpacities.tileFillOpacity})`,
		boxShadow: `0 1px 0 rgb(255 255 255 / ${statLayerOpacities.tileTopStrokeOpacity * borderLayerOpacity}), inset 0 0.5px 0.5px rgb(0 0 0 / ${statLayerOpacities.tileInsetShadowOpacity * borderLayerOpacity})`,
	};
	const cardShellLayoutStyle: CSSProperties = {
		borderRadius: scaleLength(18),
		boxShadow: `0 0 ${scaleLength(10.1)} rgba(0,0,0,0.08)`,
		height: scaleLength(358),
		paddingBottom: scaleLength(10),
		paddingLeft: scaleLength(14),
		paddingRight: scaleLength(14),
		paddingTop: scaleLength(15),
		width: scaleLength(233),
	};
	const headerRowStyle: CSSProperties = {
		gap: scaleLength(10),
	};
	const headerValueStyle: CSSProperties = {
		fontSize: scaleLength(17.07),
	};
	const headerMetricLabelStyle: CSSProperties = {
		fontSize: scaleLength(10),
		marginLeft: scaleLength(5),
	};
	const headerRightLabelStyle: CSSProperties = {
		fontSize: scaleLength(10),
	};
	const headerRightMetricContainerStyle: CSSProperties = {
		maxWidth: scaleLength(112),
	};
	const headerRightValueStyle: CSSProperties = {
		fontSize: scaleLength(11),
		marginTop: headerRightMetric?.label ? scaleLength(4) : undefined,
	};
	const mediaPanelStyle: CSSProperties = {
		borderRadius: scaleLength(14),
		height: scaleLength(158),
		marginTop: scaleLength(12),
		width: scaleLength(158),
	};
	const portraitPanelStyle: CSSProperties = {
		borderRadius: scaleLength(10),
		paddingBottom: scaleLength(10),
		paddingLeft: scaleLength(12),
		paddingRight: scaleLength(12),
		paddingTop: scaleLength(10),
	};
	const placeholderInitialsStyle: CSSProperties = {
		fontSize: scaleLength(54),
	};
	const nameBlockStyle: CSSProperties = {
		marginTop: scaleLength(16),
		paddingLeft: scaleLength(3),
		paddingRight: scaleLength(3),
	};
	const nameStyle: CSSProperties = {
		fontSize: scaleLength(19),
	};
	const statSectionStyle: CSSProperties = {
		...statSectionSurfaceStyle,
		borderRadius: scaleLength(12),
		marginTop: scaleLength(2),
	};
	const statGridStyle: CSSProperties = {
		fontSize: scaleLength(11),
		gap: scaleLength(6),
	};
	const statTileStyle: CSSProperties = {
		borderRadius: scaleLength(usesTeamCardPreviewLayout ? 9 : 10),
		minHeight: scaleLength(usesTeamCardPreviewLayout ? 26 : 32),
		paddingBottom: scaleLength(usesTeamCardPreviewLayout ? 1 : 6),
		paddingLeft: scaleLength(8),
		paddingRight: scaleLength(8),
		paddingTop: scaleLength(usesTeamCardPreviewLayout ? 1 : 6),
	};
	const statInnerGridStyle: CSSProperties = {
		gap: scaleLength(6),
		transform: `translateY(${scaleLength(0.5)})`,
	};
	const statLabelStyle: CSSProperties = {
		gap: scaleLength(4),
	};
	const statIconStyle: CSSProperties = {
		height: scaleLength(12),
		width: scaleLength(12),
	};

	useLayoutEffect(() => {
		const statSectionNode = statSectionRef.current;

		if (!statSectionNode) {
			return;
		}

		const updateStatSurfaceStyles = () => {
			const sectionWidth = statSectionNode.clientWidth;
			const sectionHeight = statSectionNode.clientHeight;
			const nextStyles: Record<string, WalkInTeamMemberCardStatSurfaceStyle> =
				{};

			for (const stat of statItems) {
				const statTileNode = statTileRefs.current[stat.key];

				if (!statTileNode) {
					continue;
				}

				const backgroundPosition = `-${statTileNode.offsetLeft + STAT_SURFACE_BLEED_PX}px -${statTileNode.offsetTop + STAT_SURFACE_BLEED_PX}px`;
				const backgroundSize = `${sectionWidth + STAT_SURFACE_BLEED_PX * 2}px ${sectionHeight + STAT_SURFACE_BLEED_PX * 2}px`;

				nextStyles[stat.key] = {
					"--walk-in-team-card-stat-surface-position": backgroundPosition,
					"--walk-in-team-card-stat-surface-size": backgroundSize,
				};
			}

			setStatSurfaceStyles(nextStyles);
		};

		updateStatSurfaceStyles();
		const resizeObserver = new ResizeObserver(() => {
			updateStatSurfaceStyles();
		});

		resizeObserver.observe(statSectionNode);
		for (const stat of statItems) {
			const statTileNode = statTileRefs.current[stat.key];
			if (statTileNode) {
				resizeObserver.observe(statTileNode);
			}
		}

		return () => {
			resizeObserver.disconnect();
		};
	}, [statItems]);

	return (
		<li className="list-none">
			<article
				className={cn(
					adaptedTeamCardShellClassName,
					isDarkTheme ? "border-white/12 text-[#f5f1ec]" : null,
					shellClassName,
				)}
				style={{ ...cardShellLayoutStyle, ...shellStyle }}
			>
				<div
					className={cn(
						"flex items-start",
						headerLeftMetric ? "justify-between" : "justify-end",
					)}
					style={headerRowStyle}
				>
					{headerLeftMetric ? (
						<div
							className="flex min-w-0 items-start"
							title={headerLeftMetric.title}
						>
							<div
								className={cn(
									adaptedTeamCardHeaderValueClassName,
									isDarkTheme ? "text-[#fff8f0]" : null,
									isMutedTheme ? "text-[#f6efe4]" : null,
								)}
								style={headerValueStyle}
							>
								{headerLeftMetric.value}
							</div>
							{headerLeftMetric.label ? (
								<div
									className={cn(
										adaptedTeamCardHeaderLabelClassName,
										isDarkTheme ? "text-[#fff8f0]" : null,
										isMutedTheme ? "text-[#f6efe4]" : null,
									)}
									style={headerMetricLabelStyle}
								>
									{headerLeftMetric.label}
								</div>
							) : null}
						</div>
					) : null}

					{headerRightMetric ? (
						<div
							className="min-w-0 text-right"
							title={headerRightMetric.title}
							style={headerRightMetricContainerStyle}
						>
							{headerRightMetric.label ? (
								<div
									className={cn(
										"font-semibold leading-none tracking-[0.06em] text-[#7b7671]",
										isDarkTheme ? "text-white/62" : null,
										isMutedTheme ? "text-[#d6cdc2]" : null,
									)}
									style={headerRightLabelStyle}
								>
									{headerRightMetric.label}
								</div>
							) : null}
							<div
								className={cn(
									"font-semibold leading-[0.95] tracking-[-0.03em] text-[#272423]",
									isDarkTheme ? "text-[#fff8f0]" : null,
									isMutedTheme ? "text-[#f6efe4]" : null,
								)}
								style={headerRightValueStyle}
							>
								{headerRightMetric.value}
							</div>
						</div>
					) : null}
				</div>

				<div
					className={cn(
						adaptedTeamCardMediaPanelClassName,
						mediaPanelClassName,
					)}
					style={mediaPanelStyle}
				>
					<div
						className={cn(
							portraitPanelClassName,
							tonePortraitClassNames[effectiveTone],
						)}
						style={portraitPanelStyle}
					>
						{row.imageUrl ? (
							<>
								<img
									src={row.imageUrl}
									alt={row.displayName}
									className="absolute inset-0 h-full w-full object-cover object-center"
								/>
								<div
									className={cn(
										"absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%,rgba(0,0,0,0.18)_100%)]",
										mediaOverlayClassName,
									)}
								/>
								<div className="relative z-10 flex-1" />
							</>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<div
									className={portraitPlaceholderInitialsClassName}
									style={placeholderInitialsStyle}
								>
									{initials}
								</div>
							</div>
						)}
					</div>
				</div>

				<div
					className="flex flex-1 flex-col text-center"
					style={nameBlockStyle}
				>
					<div
						className={cn(
							adaptedTeamCardNameClassName,
							isDarkTheme ? "text-[#fff8f0]" : null,
							isMutedTheme ? "text-[#f6efe4]" : null,
						)}
						style={nameStyle}
					>
						{row.displayName}
					</div>
					<div className="flex flex-1 items-center justify-center" />
				</div>

				<div
					className="relative z-10"
					ref={statSectionRef}
					style={statSectionStyle}
				>
					<div
						className="relative grid grid-cols-2 [font-family:var(--dashboard-01-font-roster-mono)] font-normal text-[#4b4d49]"
						style={statGridStyle}
					>
						{statItems.map((stat) => (
							<div
								key={stat.key}
								className={cn(
									"relative z-10 min-w-0 overflow-hidden bg-white/74",
									statTileClassName,
								)}
								ref={(node) => {
									statTileRefs.current[stat.key] = node;
								}}
								style={{
									...statSurfaceStyles[stat.key],
									...statTileStyle,
								}}
								title={stat.title}
							>
								<div
									aria-hidden="true"
									className="absolute inset-0 rounded-[inherit]"
									style={{
										...statTileLayerStyle,
										...statSurfaceStyles[stat.key],
										backgroundImage: [
											`linear-gradient(rgb(${maskRgb} / ${whiteMaskOpacity}), rgb(${maskRgb} / ${whiteMaskOpacity}))`,
											...(statLayerOpacities.hideTextureImage
												? []
												: ["var(--walk-in-team-card-stat-surface-texture)"]),
										].join(", "),
										backgroundPosition:
											"var(--walk-in-team-card-stat-surface-position)",
										backgroundRepeat: "no-repeat",
										backgroundSize:
											"var(--walk-in-team-card-stat-surface-size)",
									}}
								/>
								<div
									aria-hidden="true"
									className="absolute inset-0 rounded-[inherit]"
									style={{
										...statSurfaceStyles[stat.key],
										backgroundImage: `linear-gradient(var(--walk-in-card-stat-gloss-angle, 118deg), rgba(255,255,255,0) 0%, rgba(255,107,156,${statLayerOpacities.rainbowShineOpacity}) 14%, rgba(255,199,0,${statLayerOpacities.rainbowShineOpacity}) 31%, rgba(102,255,191,${statLayerOpacities.rainbowShineOpacity}) 48%, rgba(72,198,255,${statLayerOpacities.rainbowShineOpacity}) 66%, rgba(173,127,255,${statLayerOpacities.rainbowShineOpacity}) 82%, rgba(255,255,255,0) 100%)`,
										backgroundPosition:
											"var(--walk-in-team-card-stat-surface-position)",
										backgroundRepeat: "no-repeat",
										backgroundSize:
											"var(--walk-in-team-card-stat-surface-size)",
										maskImage:
											"radial-gradient(140% 120% at var(--walk-in-card-stat-mask-x, 50%) var(--walk-in-card-stat-mask-y, 18%), rgb(0 0 0 / 0.96) 0%, rgb(0 0 0 / 0.84) 22%, rgb(0 0 0 / 0.36) 54%, rgb(0 0 0 / 0) 86%)",
										maskPosition:
											"var(--walk-in-team-card-stat-surface-position)",
										maskRepeat: "no-repeat",
										maskSize: "var(--walk-in-team-card-stat-surface-size)",
										WebkitMaskImage:
											"radial-gradient(140% 120% at var(--walk-in-card-stat-mask-x, 50%) var(--walk-in-card-stat-mask-y, 18%), rgb(0 0 0 / 0.96) 0%, rgb(0 0 0 / 0.84) 22%, rgb(0 0 0 / 0.36) 54%, rgb(0 0 0 / 0) 86%)",
										WebkitMaskPosition:
											"var(--walk-in-team-card-stat-surface-position)",
										WebkitMaskRepeat: "no-repeat",
										WebkitMaskSize:
											"var(--walk-in-team-card-stat-surface-size)",
									}}
								/>
								<div
									className="relative z-10 grid h-full grid-cols-[auto_minmax(0,1fr)] items-center"
									style={statInnerGridStyle}
								>
									<div
										className={cn(
											"flex h-full shrink-0 items-center leading-[1] tracking-[0.08em] text-black/42",
											statTextUsesMutedWhite ? "text-white/56" : null,
										)}
										style={statLabelStyle}
									>
										{stat.icon === "claude" ? (
											<ClaudeStatIcon style={statIconStyle} />
										) : stat.icon === "codex" ? (
											<CodexStatIcon style={statIconStyle} />
										) : null}
										{stat.label ? <span>{stat.label}</span> : null}
									</div>
									<div
										className={cn(
											"min-w-0 self-center text-right leading-[1] tracking-[-0.04em] tabular-nums text-[#272423]",
											statTextUsesMutedWhite ? "text-white/72" : null,
										)}
									>
										{stat.value}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</article>
		</li>
	);
}

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

function getCardTone(row: TeamPageMemberRow): TeamCardTone {
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

	return "rose";
}

function ClaudeStatIcon(props: { style?: CSSProperties }) {
	const { style } = props;

	return (
		<svg
			viewBox="0 0 1200 1200"
			aria-hidden="true"
			className="shrink-0"
			style={style}
		>
			<path
				fill="currentColor"
				d="M233.959793 800.214905L468.644287 668.536987L472.590637 657.100647L468.644287 650.738403L457.208069 650.738403L417.986633 648.322144L283.892639 644.69812L167.597321 639.865845L54.926208 633.825623L26.577238 627.785339L0.00033 592.751709L2.73832 575.27533L26.577238 559.248352L60.724873 562.228149L136.187973 567.382629L249.422867 575.194763L331.570496 580.026978L453.261841 592.671082L472.590637 592.671082L475.328857 584.859009L468.724915 580.026978L463.570557 575.194763L346.389313 495.785217L219.543671 411.865906L153.100723 363.543762L117.181267 339.060425L99.060455 316.107361L91.248367 266.01355L123.865784 230.093994L167.677887 233.073853L178.872513 236.053772L223.248367 270.201477L318.040283 343.570496L441.825592 434.738342L459.946411 449.798706L467.194672 444.64447L468.080597 441.020203L459.946411 427.409485L392.617493 305.718323L320.778564 181.932983L288.80542 130.630859L280.348999 99.865845C277.369171 87.221436 275.194641 76.590698 275.194641 63.624268L312.322174 13.20813L332.8591 6.604126L382.389313 13.20813L403.248352 31.328979L434.013519 101.71814L483.865753 212.537048L561.181274 363.221497L583.812134 407.919434L595.892639 449.315491L600.40271 461.959839L608.214783 461.959839L608.214783 454.711609L614.577271 369.825623L626.335632 265.61084L637.771851 131.516846L641.718201 93.745117L660.402832 48.483276L697.530334 24.000122L726.52356 37.852417L750.362549 72L747.060486 94.067139L732.886047 186.201416L705.100708 330.52356L686.979919 427.167847L697.530334 427.167847L709.61084 415.087341L758.496704 350.174561L840.644348 247.490051L876.885925 206.738342L919.167847 161.71814L946.308838 140.29541L997.61084 140.29541L1035.38269 196.429626L1018.469849 254.416199L965.637634 321.422852L921.825562 378.201538L859.006714 462.765259L819.785278 530.41626L823.409424 535.812073L832.75177 534.92627L974.657776 504.724915L1051.328979 490.872559L1142.818848 475.167786L1184.214844 494.496582L1188.724854 514.147644L1172.456421 554.335693L1074.604126 578.496765L959.838989 601.449829L788.939636 641.879272L786.845764 643.409485L789.261841 646.389343L866.255127 653.637634L899.194702 655.409424L979.812134 655.409424L1129.932861 666.604187L1169.154419 692.537109L1192.671265 724.268677L1188.724854 748.429688L1128.322144 779.194641L1046.818848 759.865845L856.590759 714.604126L791.355774 698.335754L782.335693 698.335754L782.335693 703.731567L836.69812 756.885986L936.322205 846.845581L1061.073975 962.81897L1067.436279 991.490112L1051.409424 1014.120911L1034.496704 1011.704712L924.885986 929.234924L882.604126 892.107544L786.845764 811.48999L780.483276 811.48999L780.483276 819.946289L802.550415 852.241699L919.087341 1027.409424L925.127625 1081.127686L916.671204 1098.604126L886.469849 1109.154419L853.288696 1103.114136L785.073914 1007.355835L714.684631 899.516785L657.906067 802.872498L650.979858 806.81897L617.476624 1167.704834L601.771851 1186.147705L565.530212 1200L535.328857 1177.046997L519.302124 1139.919556L535.328857 1066.550537L554.657776 970.792053L570.362488 894.68457L584.536926 800.134277L592.993347 768.724976L592.429626 766.630859L585.503479 767.516968L514.22821 865.369263L405.825531 1011.865906L320.053711 1103.677979L299.516815 1111.812256L263.919525 1093.369263L267.221497 1060.429688L287.114136 1031.114136L405.825531 880.107361L477.422913 786.52356L523.651062 732.483276L523.328918 724.671265L520.590698 724.671265L205.288605 929.395935L149.154434 936.644409L124.993355 914.01355L127.973183 876.885986L139.409409 864.80542L234.201385 799.570435L233.879227 799.8927Z"
			/>
		</svg>
	);
}

function CodexStatIcon(props: { style?: CSSProperties }) {
	const { style } = props;

	return (
		<svg
			viewBox="0 0 320 320"
			aria-hidden="true"
			className="shrink-0"
			style={style}
		>
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}

function scaleLength(value: number) {
	return `calc(${CARD_RENDER_SCALE_VAR} * ${value}px)`;
}
