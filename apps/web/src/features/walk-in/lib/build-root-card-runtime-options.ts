import type {
	WalkInCardModel,
	WalkInMetricRow,
} from "@/features/walk-in/lib/build-walk-in-card-model";
import type { MymindTradingCardOptions } from "@/features/walk-in/lib/mymind-runtime";

const SVG_WIDTH = 1498;
const SVG_HEIGHT = 2080;

interface RootCardRuntimePalette {
	accentText: string;
	badgeTileGradient: string;
	portraitPanelGradient: string;
	shellGradient: string;
	statsPanelGradient: string;
	subtleText: string;
	text: string;
}

interface RootCardRuntimePresentation {
	archetypeToken: string;
	badgeInitials: string;
	displayName: string;
	overall: number;
	palette: RootCardRuntimePalette;
	roleLabel: string;
	statColumns: ReadonlyArray<
		ReadonlyArray<readonly [label: string, value: string]>
	>;
	subtitle: string;
}

export interface BuildRootCardRuntimeOptionsInput {
	accountLabel: string;
	avatarSrc: string;
	model: WalkInCardModel;
	organizationLogoSrc: string | null;
	organizationName: string | null;
}

export function buildRootCardRuntimeOptions(
	input: BuildRootCardRuntimeOptionsInput,
): MymindTradingCardOptions {
	const {
		accountLabel,
		avatarSrc,
		model,
		organizationLogoSrc,
		organizationName,
	} = input;
	const presentation = buildRootCardRuntimePresentation({
		accountLabel,
		model,
	});
	const artworkImage = buildArtworkLayer({
		avatarSrc,
		organizationLogoSrc,
		organizationName,
		presentation,
	});
	const frameImage = buildFrameLayer({
		presentation,
	});
	const overlayImage = buildOverlayLayer();

	return {
		...model.runtimeOptions,
		artworkBrightness: 1,
		artworkColorContrast: 1,
		artworkColorMapContrast: 1,
		artworkImage,
		artworkIridescentBlend: 0,
		artworkNormalMap: null,
		artworkNormalScale: 0,
		foregroundBrightness: 0,
		foregroundColorContrast: 1,
		foregroundColorMapContrast: 1,
		foregroundImage: null,
		foregroundIridescentBlend: 0,
		foregroundNormalMap: null,
		foregroundNormalScale: 0,
		frameBrightness: 1,
		frameColorContrast: 1,
		frameColorMapContrast: 1,
		frameIridescentBlend: 0,
		frameImage,
		frameNormalMap: null,
		frameNormalScale: 0,
		generalBrightness: 1,
		generalContrast: 1,
		generalSaturation: 1,
		orbAlphaMap: null,
		orbBrightness: 0,
		orbIridescentBlend: 0,
		orbNormalMap: null,
		orbNormalScale: 0,
		overlayBrightness: 1,
		overlayColorContrast: 1,
		overlayColorMapContrast: 1,
		overlayImage,
		overlayIridescentBlend: 0,
		overlayNormalMap: null,
		overlayNormalScale: 0,
		pictoAlphaMap: null,
		pictoBrightness: 0,
		pictoIridescentBlend: 0,
		pictoNormalMap: null,
		pictoNormalScale: 0,
		preventReveal: false,
	};
}

function buildRootCardRuntimePresentation(params: {
	accountLabel: string;
	model: WalkInCardModel;
}): RootCardRuntimePresentation {
	const { accountLabel, model } = params;
	const displayName = getDisplayName(accountLabel);
	const badgeInitials = getInitials(displayName);
	const archetypeToken = getArchetypeToken(model.archetypeLabel);
	const statValues = buildStatValues(model.metricRows);
	const overall = Math.max(
		58,
		Math.round(
			statValues.reduce((sum, statValue) => sum + statValue, 0) /
				statValues.length,
		),
	);

	return {
		archetypeToken,
		badgeInitials,
		displayName,
		overall,
		palette: getRootCardRuntimePalette(model),
		roleLabel: model.dominantSourceLabel,
		statColumns: [
			[
				["OUT", String(statValues[0] ?? 72)],
				["SPE", String(statValues[1] ?? 74)],
				["CRA", String(statValues[2] ?? 76)],
			],
			[
				["QUA", String(statValues[3] ?? 78)],
				["EFF", String(statValues[4] ?? 80)],
				["CON", String(statValues[5] ?? 82)],
			],
		],
		subtitle: model.favoriteModelLabel,
	};
}

function buildStatValues(metricRows: readonly WalkInMetricRow[]) {
	const sessionValue = getMetricStatValue(metricRows[0], 76);
	const splitValue = getMetricStatValue(metricRows[1], 74);
	const tokenValue = getMetricStatValue(metricRows[2], 88);
	const lockValue = getMetricStatValue(metricRows[3], 68);
	const spendValue = getMetricStatValue(metricRows[4], 70);
	const controlValue = Math.round((sessionValue + splitValue + spendValue) / 3);

	return [
		tokenValue,
		sessionValue,
		lockValue,
		spendValue,
		splitValue,
		controlValue,
	];
}

function getMetricStatValue(
	metricRow: WalkInMetricRow | undefined,
	fallback: number,
) {
	if (!metricRow) {
		return fallback;
	}

	return Math.max(
		42,
		Math.min(99, Math.round(42 + metricRow.progressRatio * 57)),
	);
}

function getDisplayName(accountLabel: string) {
	if (!accountLabel.includes("@")) {
		return accountLabel;
	}

	return accountLabel.split("@")[0] || accountLabel;
}

function getInitials(displayName: string) {
	const parts = displayName.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "RD";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "RD";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function getArchetypeToken(archetypeLabel: string) {
	const parts = archetypeLabel.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "RD";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "RD";
	}

	return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function getRootCardRuntimePalette(
	model: WalkInCardModel,
): RootCardRuntimePalette {
	const dominantSourceLabel = model.dominantSourceLabel.toLowerCase();
	const favoriteModelLabel = model.favoriteModelLabel.toLowerCase();

	if (
		dominantSourceLabel.includes("codex") ||
		favoriteModelLabel.includes("gpt") ||
		favoriteModelLabel.includes("codex")
	) {
		return {
			accentText: "#356db8",
			badgeTileGradient: "linear-gradient(180deg,#deebff 0%,#9ec5fe 100%)",
			portraitPanelGradient: "linear-gradient(180deg,#d8e8ff 0%,#8fb7ec 100%)",
			shellGradient: "linear-gradient(180deg,#fcfbf8 0%,#f4eee7 100%)",
			statsPanelGradient:
				"linear-gradient(135deg,#3a3a3a 0%,#2a2a2a 25%,#1a1a1a 50%,#2a2a2a 75%,#3a3a3a 100%)",
			subtleText: "#5f5a57",
			text: "#272423",
		};
	}

	if (
		dominantSourceLabel.includes("claude") ||
		favoriteModelLabel.includes("claude")
	) {
		return {
			accentText: "#2f9e8f",
			badgeTileGradient: "linear-gradient(180deg,#d3faf4 0%,#8ce6d7 100%)",
			portraitPanelGradient: "linear-gradient(180deg,#d7f6ef 0%,#87d8c7 100%)",
			shellGradient: "linear-gradient(180deg,#fcfbf8 0%,#f4eee7 100%)",
			statsPanelGradient:
				"linear-gradient(135deg,#3a3a3a 0%,#2a2a2a 25%,#1a1a1a 50%,#2a2a2a 75%,#3a3a3a 100%)",
			subtleText: "#5f5a57",
			text: "#272423",
		};
	}

	return {
		accentText: "#d06b87",
		badgeTileGradient: "linear-gradient(180deg,#ffe7eb 0%,#f9b5bf 100%)",
		portraitPanelGradient: "linear-gradient(180deg,#ffe5ea 0%,#ec9eb0 100%)",
		shellGradient: "linear-gradient(180deg,#fcfbf8 0%,#f4eee7 100%)",
		statsPanelGradient:
			"linear-gradient(135deg,#3a3a3a 0%,#2a2a2a 25%,#1a1a1a 50%,#2a2a2a 75%,#3a3a3a 100%)",
		subtleText: "#5f5a57",
		text: "#272423",
	};
}

function buildArtworkLayer(params: {
	avatarSrc: string;
	organizationLogoSrc: string | null;
	organizationName: string | null;
	presentation: RootCardRuntimePresentation;
}) {
	const { avatarSrc, organizationLogoSrc, organizationName, presentation } =
		params;
	const { palette } = presentation;
	const workspaceLogoSrc = organizationLogoSrc?.trim() || "/logo-dark.svg";
	const workspaceLogoAlt = organizationName ?? "Rudel";
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <defs>
    <linearGradient id="shellGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcfbf8" />
      <stop offset="100%" stop-color="#f4eee7" />
    </linearGradient>
    <linearGradient id="portraitGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.portraitPanelGradient.includes("#d7f6ef") ? "#d7f6ef" : palette.portraitPanelGradient.includes("#d8e8ff") ? "#d8e8ff" : "#ffe5ea"}" />
      <stop offset="100%" stop-color="${palette.portraitPanelGradient.includes("#87d8c7") ? "#87d8c7" : palette.portraitPanelGradient.includes("#8fb7ec") ? "#8fb7ec" : "#ec9eb0"}" />
    </linearGradient>
    <linearGradient id="badgeGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.badgeTileGradient.includes("#d3faf4") ? "#d3faf4" : palette.badgeTileGradient.includes("#deebff") ? "#deebff" : "#ffe7eb"}" />
      <stop offset="100%" stop-color="${palette.badgeTileGradient.includes("#8ce6d7") ? "#8ce6d7" : palette.badgeTileGradient.includes("#9ec5fe") ? "#9ec5fe" : "#f9b5bf"}" />
    </linearGradient>
    <clipPath id="portraitClip">
      <rect x="380" y="314" width="930" height="900" rx="72" />
    </clipPath>
    <clipPath id="workspaceClip">
      <rect x="112" y="410" width="124" height="124" rx="22" />
    </clipPath>
  </defs>

  <rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="118" fill="url(#shellGradient)" />
  <rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="118" fill="rgba(255,255,255,0.22)" />

  <g>
    <text x="104" y="150" fill="${escapeXml(palette.text)}" font-family="Arial, Helvetica, sans-serif" font-size="128" font-weight="800" letter-spacing="-4">${presentation.overall}</text>
    <text x="298" y="148" fill="${escapeXml(palette.accentText)}" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="700" letter-spacing="-1">${escapeXml(presentation.archetypeToken)}</text>
    <text x="1188" y="148" fill="${escapeXml(palette.subtleText)}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="600" text-anchor="end">${escapeXml(presentation.roleLabel)}</text>
  </g>

  <rect x="88" y="260" width="1322" height="944" rx="84" fill="url(#portraitGradient)" />
  <rect x="88" y="260" width="1322" height="944" rx="84" fill="rgba(255,255,255,0.18)" />

  <g>
    <rect x="112" y="410" width="124" height="124" rx="22" fill="#f6f4ef" />
    <rect x="112" y="410" width="124" height="124" rx="22" fill="#111111" />
    <image href="${escapeXml(workspaceLogoSrc)}" x="112" y="410" width="124" height="124" preserveAspectRatio="xMidYMid meet" clip-path="url(#workspaceClip)" />
    <title>${escapeXml(workspaceLogoAlt)}</title>

    <rect x="112" y="572" width="124" height="124" rx="22" fill="#f6f4ef" />
    <rect x="157" y="614" width="34" height="34" rx="10" fill="#d3d0ca" />

    <rect x="112" y="734" width="124" height="124" rx="22" fill="#f6f4ef" />
    <rect x="150" y="777" width="48" height="26" rx="13" fill="#d3d0ca" />
  </g>

  <image href="${escapeXml(avatarSrc)}" x="380" y="314" width="930" height="900" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)" />
  <rect x="380" y="314" width="930" height="900" rx="72" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="4" />
  <rect x="380" y="314" width="930" height="900" rx="72" fill="url(#portraitGradient)" opacity="0.18" />
  <rect x="380" y="314" width="930" height="900" rx="72" fill="url(#shellGradient)" opacity="0.12" />
  <rect x="380" y="314" width="930" height="900" rx="72" fill="rgba(0,0,0,0.06)" />
  <path d="M380 314H1310V1214H380Z" fill="url(#shellGradient)" opacity="0.08" />

  <g>
    <text x="749" y="1412" fill="${escapeXml(palette.text)}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="126" font-weight="800" letter-spacing="-3" text-anchor="middle">${escapeXml(presentation.displayName)}</text>
    <text x="749" y="1526" fill="${escapeXml(palette.subtleText)}" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="600" letter-spacing="-2" text-anchor="middle">${escapeXml(presentation.subtitle)}</text>
  </g>

  <g transform="translate(88 1600)">
    <rect x="0" y="0" width="1322" height="358" rx="84" fill="${escapeXml(palette.statsPanelGradient)}" />
    <rect x="0" y="0" width="1322" height="358" rx="84" fill="rgba(255,255,255,0.07)" />
    ${buildStatColumnSvg(presentation.statColumns[0] ?? [], 136, "start")}
    ${buildStatColumnSvg(presentation.statColumns[1] ?? [], 1186, "end")}
  </g>
</svg>`;

	return toSvgDataUrl(svg);
}

function buildStatColumnSvg(
	rows: ReadonlyArray<readonly [label: string, value: string]>,
	x: number,
	textAnchor: "end" | "start",
) {
	return rows
		.map(([label, value], index) => {
			const y = 108 + index * 100;
			const gap = textAnchor === "end" ? -106 : 106;
			const labelX = x + gap;

			return `
      <text x="${x}" y="${y}" fill="#f6f1ea" font-family="SFMono-Regular, Menlo, monospace" font-size="70" font-weight="500" text-anchor="${textAnchor}">${escapeXml(value)}</text>
      <text x="${labelX}" y="${y}" fill="rgba(246,241,234,0.72)" font-family="SFMono-Regular, Menlo, monospace" font-size="54" font-weight="500" text-anchor="${textAnchor}">${escapeXml(label)}</text>`;
		})
		.join("");
}

function buildFrameLayer(params: {
	presentation: RootCardRuntimePresentation;
}) {
	const { presentation } = params;
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect x="26" y="26" width="${SVG_WIDTH - 52}" height="${SVG_HEIGHT - 52}" rx="118" fill="none" stroke="rgba(255,255,255,0.82)" stroke-width="10" />
  <rect x="56" y="56" width="${SVG_WIDTH - 112}" height="${SVG_HEIGHT - 112}" rx="96" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="3" />
  <rect x="88" y="260" width="1322" height="944" rx="84" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="4" />
  <rect x="88" y="1600" width="1322" height="358" rx="84" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4" />
  <circle cx="1248" cy="176" r="72" fill="rgba(255,255,255,0.14)" />
  <text x="1248" y="198" fill="${escapeXml(presentation.palette.accentText)}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" text-anchor="middle">${escapeXml(presentation.badgeInitials)}</text>
</svg>`;

	return toSvgDataUrl(svg);
}

function buildOverlayLayer() {
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <defs>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.36)" />
      <stop offset="38%" stop-color="rgba(255,255,255,0.08)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
  </defs>
  <path d="M80 40C430 20 690 10 1090 60C1280 84 1410 190 1460 372V740C1330 540 1150 420 920 376C690 334 412 386 170 490L80 40Z" fill="url(#gloss)" />
  <rect x="128" y="1638" width="620" height="40" rx="20" fill="rgba(255,255,255,0.05)" />
</svg>`;

	return toSvgDataUrl(svg);
}

function toSvgDataUrl(svg: string) {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
