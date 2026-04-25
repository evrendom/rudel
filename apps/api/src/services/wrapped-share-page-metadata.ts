import type { PublicWrappedShare } from "@rudel/api-routes";

interface WrappedSharePageMetadata {
	description: string;
	imageAlt: string;
	imageUrl: string;
	publicUrl: string;
	title: string;
}

export function buildWrappedSharePageMetadata(input: {
	imageUrl: string;
	publicUrl: string;
	share: PublicWrappedShare;
}): WrappedSharePageMetadata {
	const { imageUrl, publicUrl, share } = input;
	const { snapshot } = share;
	const displayName = snapshot.row.displayName;
	const title = `${displayName}'s Rudel Wrapped`;
	const description = `${displayName} is a ${snapshot.archetypeLabel}. ${formatCompactMetric(snapshot.row.totalTokens)} tokens across ${formatCompactMetric(snapshot.row.totalSessions)} sessions. Make yours.`;

	return {
		description,
		imageAlt: `${displayName}'s Rudel Wrapped card`,
		imageUrl,
		publicUrl,
		title,
	};
}

export function injectWrappedSharePageMetadata(
	indexHtml: string,
	metadata: WrappedSharePageMetadata,
) {
	const htmlWithTitle = indexHtml
		.replace(
			/<title>.*?<\/title>/iu,
			`<title>${escapeHtml(metadata.title)}</title>`,
		)
		.replace(
			/<meta\s+name=["']description["'][^>]*>\s*/iu,
			`<meta name="description" content="${escapeHtmlAttribute(metadata.description)}" />\n    `,
		);

	return htmlWithTitle.replace(
		"</head>",
		`${buildWrappedShareMetadataTags(metadata)}\n  </head>`,
	);
}

function buildWrappedShareMetadataTags(metadata: WrappedSharePageMetadata) {
	const title = escapeHtmlAttribute(metadata.title);
	const description = escapeHtmlAttribute(metadata.description);
	const publicUrl = escapeHtmlAttribute(metadata.publicUrl);
	const imageUrl = escapeHtmlAttribute(metadata.imageUrl);
	const imageAlt = escapeHtmlAttribute(metadata.imageAlt);

	return [
		`    <meta property="og:type" content="website" />`,
		`    <meta property="og:title" content="${title}" />`,
		`    <meta property="og:description" content="${description}" />`,
		`    <meta property="og:url" content="${publicUrl}" />`,
		`    <meta property="og:image" content="${imageUrl}" />`,
		`    <meta property="og:image:alt" content="${imageAlt}" />`,
		`    <meta name="twitter:card" content="summary_large_image" />`,
		`    <meta name="twitter:title" content="${title}" />`,
		`    <meta name="twitter:description" content="${description}" />`,
		`    <meta name="twitter:image" content="${imageUrl}" />`,
		`    <meta name="twitter:image:alt" content="${imageAlt}" />`,
	].join("\n");
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

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string) {
	return escapeHtml(value).replaceAll('"', "&quot;");
}
