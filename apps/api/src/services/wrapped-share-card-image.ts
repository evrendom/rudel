import { Resvg } from "@resvg/resvg-js";
import type { WrappedShareSnapshot } from "@rudel/api-routes";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const SVG_XMLNS = "http://www.w3.org/2000/svg";
const DATA_IMAGE_PREFIX = "data:image/";

interface WrappedShareCardPalette {
	accent: string;
	backgroundEnd: string;
	backgroundStart: string;
	card: string;
	cardMuted: string;
	ink: string;
	muted: string;
	stroke: string;
}

const WRAPPED_SHARE_CARD_PALETTES: Record<
	WrappedShareSnapshot["theme"],
	WrappedShareCardPalette
> = {
	dark: {
		accent: "#A7F06F",
		backgroundEnd: "#141C16",
		backgroundStart: "#050806",
		card: "#F7F4EA",
		cardMuted: "#E4DFD1",
		ink: "#11140F",
		muted: "#5C6256",
		stroke: "rgba(255,255,255,0.16)",
	},
	light: {
		accent: "#4F7CFF",
		backgroundEnd: "#E8EDF8",
		backgroundStart: "#FFFFFF",
		card: "#101827",
		cardMuted: "#273248",
		ink: "#FFFFFF",
		muted: "#C9D2E4",
		stroke: "rgba(16,24,39,0.12)",
	},
	muted: {
		accent: "#FF8F4F",
		backgroundEnd: "#EDE6DA",
		backgroundStart: "#F8F4EF",
		card: "#24211E",
		cardMuted: "#3B3631",
		ink: "#FFF8EE",
		muted: "#D7CBBB",
		stroke: "rgba(36,33,30,0.14)",
	},
};

export function renderWrappedShareCardPng(snapshot: WrappedShareSnapshot) {
	const svg = buildWrappedShareCardSvg(snapshot);
	const renderedImage = new Resvg(svg, {
		background: "#ffffff",
		fitTo: {
			mode: "width",
			value: CARD_WIDTH,
		},
		font: {
			defaultFontFamily: "Arial",
			loadSystemFonts: true,
		},
		textRendering: 1,
	}).render();

	return renderedImage.asPng();
}

export function buildWrappedShareCardSvg(snapshot: WrappedShareSnapshot) {
	const palette =
		WRAPPED_SHARE_CARD_PALETTES[snapshot.theme] ??
		WRAPPED_SHARE_CARD_PALETTES.muted;
	const row = snapshot.row;
	const appearance = snapshot.appearance ?? {
		layoutMode: "front",
		showArchetypeLabel: true,
	};
	const avatarImageUrl = getEmbeddedAvatarImageUrl(row.imageUrl);
	const primaryStats = buildPrimaryStats(snapshot);
	const headlineLines = wrapSvgText(snapshot.archetypeLabel, 16, 3);
	const nameLines = wrapSvgText(row.displayName, 18, 2);
	const cardSubtitle = row.role || "Rudel user";
	const supportingCopy = buildSupportingCopy(snapshot);
	const supportingLines = wrapSvgText(supportingCopy, 42, 3);
	const avatarFallback = getInitials(row.displayName);

	return [
		`<svg xmlns="${SVG_XMLNS}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
		"<defs>",
		`<linearGradient id="wrapped-card-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.backgroundStart}"/><stop offset="1" stop-color="${palette.backgroundEnd}"/></linearGradient>`,
		`<clipPath id="wrapped-avatar-clip"><circle cx="218" cy="226" r="76"/></clipPath>`,
		"</defs>",
		`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#wrapped-card-bg)"/>`,
		`<circle cx="1040" cy="92" r="180" fill="${palette.accent}" opacity="0.2"/>`,
		`<circle cx="106" cy="578" r="230" fill="${palette.accent}" opacity="0.12"/>`,
		`<rect x="56" y="48" width="1088" height="534" rx="54" fill="rgba(255,255,255,0.46)" stroke="${palette.stroke}"/>`,
		`<text x="96" y="116" fill="#1F242D" opacity="0.58" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">RUDEL WRAPPED</text>`,
		`<text x="962" y="116" fill="#1F242D" opacity="0.46" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="end">${escapeSvgText(appearance.layoutMode === "front_back" ? "FRONT + BACK" : "FRONT")}</text>`,
		renderCardPanel({
			avatarFallback,
			avatarImageUrl,
			cardSubtitle,
			nameLines,
			palette,
			showArchetypeLabel: appearance.showArchetypeLabel,
			snapshot,
		}),
		`<g transform="translate(520 164)">`,
		renderTextLines({
			fill: "#151820",
			fontSize: 74,
			fontWeight: 800,
			letterSpacing: "-4",
			lineHeight: 72,
			lines: headlineLines,
			x: 0,
			y: 0,
		}),
		renderTextLines({
			fill: "#3F4654",
			fontSize: 28,
			fontWeight: 500,
			lineHeight: 36,
			lines: supportingLines,
			x: 4,
			y: 236,
		}),
		renderStatGrid(primaryStats, palette),
		"</g>",
		"</svg>",
	].join("");
}

function renderCardPanel(input: {
	avatarFallback: string;
	avatarImageUrl: string | null;
	cardSubtitle: string;
	nameLines: readonly string[];
	palette: WrappedShareCardPalette;
	showArchetypeLabel: boolean;
	snapshot: WrappedShareSnapshot;
}) {
	const {
		avatarFallback,
		avatarImageUrl,
		cardSubtitle,
		nameLines,
		palette,
		showArchetypeLabel,
		snapshot,
	} = input;
	const archetypeText = showArchetypeLabel
		? snapshot.archetypeLabel
		: "Rudel Wrapped";
	const archetypeLines = wrapSvgText(archetypeText, 18, 2);

	return [
		'<g transform="translate(96 148)">',
		`<rect x="0" y="0" width="370" height="370" rx="42" fill="${palette.card}"/>`,
		`<rect x="22" y="22" width="326" height="326" rx="32" fill="${palette.cardMuted}" opacity="0.42"/>`,
		`<circle cx="218" cy="78" r="130" fill="${palette.accent}" opacity="0.12"/>`,
		avatarImageUrl
			? `<image href="${escapeSvgAttribute(avatarImageUrl)}" x="142" y="150" width="152" height="152" preserveAspectRatio="xMidYMid slice" clip-path="url(#wrapped-avatar-clip)"/>`
			: `<circle cx="218" cy="226" r="76" fill="${palette.accent}"/><text x="218" y="248" fill="${palette.card}" font-family="Arial, sans-serif" font-size="52" font-weight="800" text-anchor="middle">${escapeSvgText(avatarFallback)}</text>`,
		`<circle cx="218" cy="226" r="76" fill="none" stroke="${palette.ink}" opacity="0.16" stroke-width="3"/>`,
		renderTextLines({
			fill: palette.ink,
			fontSize: 38,
			fontWeight: 800,
			letterSpacing: "-2",
			lineHeight: 42,
			lines: nameLines,
			textAnchor: "middle",
			x: 185,
			y: 64,
		}),
		`<text x="185" y="144" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${escapeSvgText(cardSubtitle)}</text>`,
		renderTextLines({
			fill: palette.ink,
			fontSize: 22,
			fontWeight: 800,
			letterSpacing: "-0.6",
			lineHeight: 26,
			lines: archetypeLines,
			textAnchor: "middle",
			x: 185,
			y: 324,
		}),
		"</g>",
	].join("");
}

function renderStatGrid(
	stats: readonly { label: string; value: string }[],
	palette: WrappedShareCardPalette,
) {
	return [
		'<g transform="translate(0 326)">',
		...stats.map((stat, index) => {
			const x = index * 184;
			return [
				`<rect x="${x}" y="0" width="164" height="92" rx="24" fill="rgba(255,255,255,0.72)" stroke="${palette.stroke}"/>`,
				`<text x="${x + 20}" y="36" fill="#151820" font-family="Arial, sans-serif" font-size="28" font-weight="800">${escapeSvgText(stat.value)}</text>`,
				`<text x="${x + 20}" y="66" fill="#5E6470" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1.2">${escapeSvgText(stat.label.toUpperCase())}</text>`,
			].join("");
		}),
		"</g>",
	].join("");
}

function buildPrimaryStats(snapshot: WrappedShareSnapshot) {
	const stats = [
		{
			label: "sessions",
			value: formatCompactMetric(snapshot.row.totalSessions),
		},
		{
			label: "tokens",
			value: formatCompactMetric(snapshot.row.totalTokens),
		},
	];

	for (const statItem of snapshot.statItems) {
		if (stats.length >= 3) {
			break;
		}

		stats.push({
			label: statItem.label ?? statItem.title ?? statItem.key,
			value: statItem.value,
		});
	}

	return stats.slice(0, 3);
}

function buildSupportingCopy(snapshot: WrappedShareSnapshot) {
	const { row } = snapshot;
	const tokens = formatCompactMetric(row.totalTokens);
	const sessions = formatCompactMetric(row.totalSessions);

	return `${row.displayName} landed as ${withArticle(snapshot.archetypeLabel)} with ${tokens} tokens across ${sessions} sessions.`;
}

function getEmbeddedAvatarImageUrl(imageUrl: string | null) {
	if (!imageUrl?.startsWith(DATA_IMAGE_PREFIX)) {
		return null;
	}

	return imageUrl;
}

function getInitials(displayName: string) {
	const parts = displayName
		.trim()
		.split(/\s+/u)
		.map((part) => part.at(0))
		.filter(Boolean);

	return (parts.length > 1 ? `${parts[0]}${parts[1]}` : (parts[0] ?? "R"))
		.toUpperCase()
		.slice(0, 2);
}

function withArticle(value: string) {
	const article = /^[aeiou]/iu.test(value) ? "an" : "a";
	return `${article} ${value}`;
}

function formatCompactMetric(value: number) {
	if (value >= 1_000_000) {
		return `${formatCompactDecimal(value / 1_000_000)}M`;
	}

	if (value >= 1_000) {
		return `${formatCompactDecimal(value / 1_000)}K`;
	}

	return Math.round(value).toString();
}

function formatCompactDecimal(value: number) {
	const rounded = Math.round(value * 10) / 10;
	return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function wrapSvgText(text: string, maxChars: number, maxLines: number) {
	const words = text.trim().split(/\s+/u);
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const nextLine = currentLine ? `${currentLine} ${word}` : word;

		if (nextLine.length <= maxChars) {
			currentLine = nextLine;
			continue;
		}

		if (currentLine) {
			lines.push(currentLine);
		}

		currentLine = word;

		if (lines.length === maxLines - 1) {
			break;
		}
	}

	if (currentLine && lines.length < maxLines) {
		lines.push(currentLine);
	}

	const remainingWords = words.slice(lines.join(" ").split(/\s+/u).length);
	if (remainingWords.length > 0 && lines.length > 0) {
		const lastLine = lines[lines.length - 1] ?? "";
		lines[lines.length - 1] = `${lastLine.replace(/\.+$/u, "")}...`;
	}

	return lines.length > 0 ? lines : [text];
}

function renderTextLines(input: {
	fill: string;
	fontSize: number;
	fontWeight: number;
	letterSpacing?: string;
	lineHeight: number;
	lines: readonly string[];
	textAnchor?: "middle" | "start";
	x: number;
	y: number;
}) {
	const {
		fill,
		fontSize,
		fontWeight,
		letterSpacing,
		lineHeight,
		lines,
		textAnchor = "start",
		x,
		y,
	} = input;
	const tspans = lines
		.map((line, index) => {
			const dy = index === 0 ? 0 : lineHeight;
			return `<tspan x="${x}" dy="${dy}">${escapeSvgText(line)}</tspan>`;
		})
		.join("");

	return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}"${letterSpacing ? ` letter-spacing="${letterSpacing}"` : ""} text-anchor="${textAnchor}">${tspans}</text>`;
}

function escapeSvgText(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeSvgAttribute(value: string) {
	return escapeSvgText(value).replaceAll('"', "&quot;");
}
