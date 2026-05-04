import { type CSSProperties, type ReactNode, useState } from "react";
import type { TeamCardTone } from "@/features/team/data/team-card-types";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import statSectionTextureWebp from "@/features/wrapped/assets/team-card-stat-texture.webp";
import { cn } from "@/lib/utils";
import { WrappedTeamCardArtboardFrame } from "./artboard-frame";
import { useWrappedStatSurfaceStyles } from "./stat-surface";

const CARD_RENDER_SCALE_VAR = "var(--wrapped-card-render-scale, 1)";

const adaptedTeamCardShellClassName =
	"team-lineup-featured-card relative isolate flex flex-col overflow-hidden bg-[linear-gradient(180deg,#fbfcfe_0%,#f0f3f7_100%)] text-[#302d2b]";

const adaptedTeamCardHeaderValueClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] font-extrabold leading-none tracking-[-0.01em] tabular-nums text-[#272423]";

const adaptedTeamCardHeaderLabelClassName =
	"font-semibold leading-none tracking-[-0.03em] text-[#272423]";

const adaptedTeamCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] font-extrabold leading-[0.9] tracking-[-0.02em] text-[#252220]";

const adaptedTeamCardMediaPanelClassName =
	"team-lineup-featured-media-panel bg-white/86";

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden";

const portraitPlaceholderEmojiClassName =
	"select-none leading-none drop-shadow-[0_1px_0_rgb(255_255_255_/_0.58)]";

const WRAPPED_ANIMAL_FACE_EMOJIS = [
	"🐶",
	"🐱",
	"🐭",
	"🐹",
	"🐰",
	"🦊",
	"🐻",
	"🐼",
	"🐨",
	"🐯",
	"🦁",
	"🐮",
	"🐷",
	"🐸",
	"🐵",
	"🐔",
] as const;

const STAT_SURFACE_BLEED_PX = 10;
const STAT_RAINBOW_MASK_IMAGE =
	"radial-gradient(140% 120% at var(--wrapped-card-stat-mask-x, 50%) var(--wrapped-card-stat-mask-y, 18%), rgb(0 0 0 / var(--wrapped-card-stat-mask-alpha-near, 0.54)) 0%, rgb(0 0 0 / var(--wrapped-card-stat-mask-alpha-mid, 0.34)) 22%, rgb(0 0 0 / var(--wrapped-card-stat-mask-alpha-far, 0.08)) 54%, rgb(0 0 0 / 0) 86%)";

const statSectionSurfaceStyle = {
	"--wrapped-team-card-stat-surface-texture": `url(${statSectionTextureWebp})`,
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

const portraitPlaceholderPanelClassName = "bg-[#ebebeb] text-[#676767]";

export interface WrappedTeamMemberCardHeaderMetric {
	label?: string;
	title?: string;
	value: string;
}

export type WrappedTeamMemberCardTheme = "dark" | "light" | "muted";
export type WrappedTeamMemberCardLayoutPreset = "default" | "team-card-preview";

export interface WrappedTeamMemberCardStatItem {
	icon?: "claude" | "codex";
	key: string;
	label?: string;
	title?: string;
	value: string;
}

export interface WrappedTeamMemberCardStatLayerOpacities {
	hideTextureImage?: boolean;
	maskTint?: "black" | "white";
	rainbowShineOpacity: number;
	tileBaseOpacity?: number;
	tileBaseTint?: "black" | "white";
	textTone?: "default" | "muted-white";
	tileBorderOpacity: number;
	tileFillOpacity: number;
	tileFillTint?: "black" | "white";
	tileInsetShadowOpacity: number;
	tileTopStrokeOpacity: number;
	textureOpacity: number;
	whiteMaskOpacity?: number;
}

export const DEFAULT_STAT_LAYER_OPACITIES: WrappedTeamMemberCardStatLayerOpacities =
	{
		hideTextureImage: false,
		maskTint: "white",
		rainbowShineOpacity: 0.38,
		tileBaseOpacity: 0.74,
		tileBaseTint: "white",
		textTone: "default",
		tileBorderOpacity: 1,
		tileFillOpacity: 0.04,
		tileFillTint: "white",
		tileInsetShadowOpacity: 0.53,
		tileTopStrokeOpacity: 0.1,
		textureOpacity: 1,
		whiteMaskOpacity: undefined,
	};

export function WrappedTeamMemberCard(props: {
	backgroundOverlayClassName?: string;
	disableOuterShadow?: boolean;
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	hideHeaderLogo?: boolean;
	layoutPreset?: WrappedTeamMemberCardLayoutPreset;
	mediaPanelClassName?: string;
	mediaOverlayContent?: ReactNode;
	mediaOverlayClassName?: string;
	nameContent?: ReactNode;
	row: TeamPageMemberRow;
	shellClassName?: string;
	shellStyle?: CSSProperties;
	statLayerOpacities?: WrappedTeamMemberCardStatLayerOpacities;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statTileClassName?: string;
	theme?: WrappedTeamMemberCardTheme;
}) {
	const {
		backgroundOverlayClassName,
		disableOuterShadow = false,
		headerLeftMetric,
		headerRightMetric,
		hideHeaderLogo = false,
		layoutPreset = "default",
		mediaPanelClassName,
		mediaOverlayClassName,
		mediaOverlayContent,
		nameContent,
		row,
		shellClassName,
		shellStyle,
		statLayerOpacities = DEFAULT_STAT_LAYER_OPACITIES,
		statItems,
		statTileClassName,
		theme = "light",
	} = props;
	const tone = getCardTone(row);
	const [failedPortraitImageUrl, setFailedPortraitImageUrl] = useState<
		string | null
	>(null);
	const shouldRenderPortraitImage = Boolean(
		row.imageUrl && row.imageUrl !== failedPortraitImageUrl,
	);
	const animalFaceEmoji = getWrappedAnimalFaceEmoji(
		`${row.userId}:${row.displayName}`,
	);
	const isDarkTheme = theme === "dark";
	const isMutedTheme = theme === "muted";
	const { statSectionRef, statSurfaceStyles, statTileRefs } =
		useWrappedStatSurfaceStyles({
			bleedPx: STAT_SURFACE_BLEED_PX,
			statItems,
		});
	const resolvedStatLayerOpacities: WrappedTeamMemberCardStatLayerOpacities = {
		...DEFAULT_STAT_LAYER_OPACITIES,
		...statLayerOpacities,
	};
	const borderLayerOpacity = resolvedStatLayerOpacities.tileBorderOpacity;
	const statTextUsesMutedWhite =
		resolvedStatLayerOpacities.textTone === "muted-white";
	const usesTeamCardPreviewLayout = layoutPreset === "team-card-preview";
	const rudelLogoSrc =
		isDarkTheme || isMutedTheme ? "/favicon-dark.svg" : "/favicon-light.svg";
	const whiteMaskOpacity =
		resolvedStatLayerOpacities.whiteMaskOpacity ??
		1 - resolvedStatLayerOpacities.textureOpacity;
	const maskRgb =
		resolvedStatLayerOpacities.maskTint === "black" ? "0 0 0" : "255 255 255";
	const tileBaseRgb =
		resolvedStatLayerOpacities.tileBaseTint === "black"
			? "0 0 0"
			: "255 255 255";
	const tileFillRgb =
		resolvedStatLayerOpacities.tileFillTint === "black"
			? "0 0 0"
			: "255 255 255";
	const cardOuterRadius = `var(--wrapped-team-card-outer-radius, ${scaleLength(18)})`;
	const statTileBaseStyle: CSSProperties = {
		backgroundColor: `rgb(${tileBaseRgb} / ${resolvedStatLayerOpacities.tileBaseOpacity ?? 0})`,
	};
	const statTileLayerStyle: CSSProperties = {
		backgroundColor: `rgb(${tileFillRgb} / ${resolvedStatLayerOpacities.tileFillOpacity})`,
		boxShadow: `0 ${scaleLength(1)} 0 rgb(255 255 255 / ${resolvedStatLayerOpacities.tileTopStrokeOpacity * borderLayerOpacity}), inset 0 ${scaleLength(0.5)} ${scaleLength(0.5)} rgb(0 0 0 / ${resolvedStatLayerOpacities.tileInsetShadowOpacity * borderLayerOpacity})`,
	};
	const cardShellLayoutStyle: CSSProperties = {
		borderRadius: cardOuterRadius,
		boxShadow: disableOuterShadow
			? "none"
			: `0 0 ${scaleLength(10.1)} rgba(0,0,0,0.08)`,
		height: scaleLength(358),
		paddingBottom: scaleLength(10),
		paddingLeft: scaleLength(14),
		paddingRight: scaleLength(14),
		paddingTop: scaleLength(15),
		width: scaleLength(233),
	};
	const headerRowStyle: CSSProperties = {
		gap: scaleLength(8),
	};
	const headerLeftGroupStyle: CSSProperties = {
		gap: scaleLength(6),
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
		maxWidth: scaleLength(92),
	};
	const headerRightValueStyle: CSSProperties = {
		fontSize: scaleLength(11),
		marginTop: headerRightMetric?.label ? scaleLength(4) : undefined,
	};
	const rudelLogoStyle: CSSProperties = {
		height: scaleLength(14),
		width: scaleLength(14),
	};
	const mediaPanelStyle: CSSProperties = {
		borderRadius: scaleLength(14),
		height: scaleLength(158),
		marginTop: scaleLength(12),
		width: scaleLength(158),
	};
	const portraitPanelRadius = scaleLength(10);
	const portraitPanelStyle = {
		"--wrapped-card-image-edit-inset": scaleLength(6),
		"--wrapped-card-image-panel-radius": portraitPanelRadius,
		"--wrapped-card-portrait-shadow-opacity": shouldRenderPortraitImage
			? undefined
			: "0.48",
		borderRadius: portraitPanelRadius,
		paddingBottom: scaleLength(10),
		paddingLeft: scaleLength(12),
		paddingRight: scaleLength(12),
		paddingTop: scaleLength(10),
	} as CSSProperties;
	const mediaOverlayStyle: CSSProperties = {
		position: "absolute",
		right: "var(--wrapped-card-image-edit-inset)",
		top: "var(--wrapped-card-image-edit-inset)",
		zIndex: 20,
	};
	const portraitImageFrameStyle: CSSProperties = {
		borderRadius: scaleLength(10),
		bottom: 0,
		left: 0,
		overflow: "hidden",
		position: "absolute",
		right: 0,
		top: 0,
	};
	const portraitImageStyle: CSSProperties = {
		display: "block",
		height: "100%",
		objectFit: "cover",
		width: "100%",
	};
	const portraitImageOverlayStyle: CSSProperties = {
		borderRadius: "inherit",
		bottom: 0,
		boxShadow:
			"inset var(--wrapped-card-portrait-shadow-x, 0px) var(--wrapped-card-portrait-shadow-y, -4px) var(--wrapped-card-portrait-shadow-blur, 4px) rgb(0 0 0 / var(--wrapped-card-portrait-shadow-opacity, 0.63)), inset var(--wrapped-card-portrait-highlight-x, 0px) var(--wrapped-card-portrait-highlight-y, 4px) var(--wrapped-card-portrait-highlight-blur, 4px) rgb(255 255 255 / var(--wrapped-card-portrait-highlight-opacity, 0.52))",
		left: 0,
		pointerEvents: "none",
		position: "absolute",
		right: 0,
		top: 0,
	};
	const portraitPlaceholderEmojiStyle: CSSProperties = {
		fontSize: scaleLength(62),
		transform: "translateY(-2%)",
	};
	const nameBlockStyle: CSSProperties = {
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

	return (
		<WrappedTeamCardArtboardFrame>
			<article
				className={cn(
					adaptedTeamCardShellClassName,
					isDarkTheme ? "border-white/12 text-[#f5f1ec]" : null,
					shellClassName,
				)}
				style={{ ...cardShellLayoutStyle, ...shellStyle }}
			>
				{backgroundOverlayClassName ? (
					<div aria-hidden="true" className={backgroundOverlayClassName} />
				) : null}
				<div className="relative z-10 flex h-full flex-col">
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
								style={headerLeftGroupStyle}
							>
								{hideHeaderLogo ? null : (
									<img
										src={rudelLogoSrc}
										alt="Rudel"
										className="shrink-0"
										style={rudelLogoStyle}
									/>
								)}
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
								shouldRenderPortraitImage
									? tonePortraitClassNames[tone]
									: portraitPlaceholderPanelClassName,
							)}
							style={portraitPanelStyle}
						>
							{shouldRenderPortraitImage ? (
								<>
									<div aria-hidden="true" style={portraitImageFrameStyle}>
										<img
											alt=""
											draggable={false}
											onError={() => {
												if (row.imageUrl) {
													setFailedPortraitImageUrl(row.imageUrl);
												}
											}}
											src={row.imageUrl ?? undefined}
											style={portraitImageStyle}
										/>
										<div style={portraitImageOverlayStyle} />
									</div>
									<div className="relative z-10 flex-1" />
								</>
							) : (
								<>
									<div aria-hidden="true" style={portraitImageOverlayStyle} />
									<div
										aria-label="Animal avatar"
										className={cn(
											"relative z-10 flex h-full w-full items-center justify-center",
											portraitPlaceholderEmojiClassName,
										)}
										role="img"
										style={portraitPlaceholderEmojiStyle}
									>
										{animalFaceEmoji}
									</div>
								</>
							)}
							{mediaOverlayContent ? (
								<div
									className={mediaOverlayClassName}
									style={mediaOverlayStyle}
								>
									{mediaOverlayContent}
								</div>
							) : null}
						</div>
					</div>

					<div
						className="grid flex-1 place-items-center text-center"
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
							{nameContent ?? row.displayName}
						</div>
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
										"relative z-10 min-w-0 overflow-hidden",
										statTileClassName,
									)}
									ref={(node) => {
										statTileRefs.current[stat.key] = node;
									}}
									style={{
										...statSurfaceStyles[stat.key],
										...statTileBaseStyle,
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
												...(resolvedStatLayerOpacities.hideTextureImage
													? []
													: ["var(--wrapped-team-card-stat-surface-texture)"]),
											].join(", "),
											backgroundPosition:
												"var(--wrapped-team-card-stat-surface-position)",
											backgroundRepeat: "no-repeat",
											backgroundSize:
												"var(--wrapped-team-card-stat-surface-size)",
										}}
									/>
									<div
										aria-hidden="true"
										className="absolute inset-0 rounded-[inherit]"
										style={{
											...statSurfaceStyles[stat.key],
											backgroundImage: `linear-gradient(var(--wrapped-card-stat-gloss-angle, 118deg), rgba(255,255,255,0) 0%, rgba(255,107,156,${resolvedStatLayerOpacities.rainbowShineOpacity}) 14%, rgba(255,199,0,${resolvedStatLayerOpacities.rainbowShineOpacity}) 31%, rgba(102,255,191,${resolvedStatLayerOpacities.rainbowShineOpacity}) 48%, rgba(72,198,255,${resolvedStatLayerOpacities.rainbowShineOpacity}) 66%, rgba(173,127,255,${resolvedStatLayerOpacities.rainbowShineOpacity}) 82%, rgba(255,255,255,0) 100%)`,
											backgroundPosition:
												"var(--wrapped-team-card-stat-surface-position)",
											backgroundRepeat: "no-repeat",
											backgroundSize:
												"var(--wrapped-team-card-stat-surface-size)",
											maskImage: STAT_RAINBOW_MASK_IMAGE,
											maskPosition:
												"var(--wrapped-team-card-stat-surface-position)",
											maskRepeat: "no-repeat",
											maskSize: "var(--wrapped-team-card-stat-surface-size)",
											WebkitMaskImage: STAT_RAINBOW_MASK_IMAGE,
											WebkitMaskPosition:
												"var(--wrapped-team-card-stat-surface-position)",
											WebkitMaskRepeat: "no-repeat",
											WebkitMaskSize:
												"var(--wrapped-team-card-stat-surface-size)",
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
				</div>
			</article>
		</WrappedTeamCardArtboardFrame>
	);
}

function getWrappedAnimalFaceEmoji(seed: string) {
	const normalizedSeed = seed.trim() || "wrapped-animal";
	let hash = 0;

	for (let index = 0; index < normalizedSeed.length; index += 1) {
		hash = (hash * 31 + normalizedSeed.charCodeAt(index)) >>> 0;
	}

	return (
		WRAPPED_ANIMAL_FACE_EMOJIS[hash % WRAPPED_ANIMAL_FACE_EMOJIS.length] ?? "🐶"
	);
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
