import type { PublicWrappedShare } from "@rudel/api-routes";

interface WrappedSharePageMetadata {
	description: string;
	imageAlt: string;
	imageHeight: number;
	imageSecureUrl?: string;
	imageType: string;
	imageUrl: string;
	imageWidth: number;
	publicUrl: string;
	title: string;
}

export function buildWrappedSharePageMetadata(input: {
	imageHeight: number;
	imageType: string;
	imageUrl: string;
	imageWidth: number;
	publicUrl: string;
	share: PublicWrappedShare;
}): WrappedSharePageMetadata {
	const { imageHeight, imageType, imageUrl, imageWidth, publicUrl, share } =
		input;
	const { snapshot } = share;
	const displayName = snapshot.row.displayName;
	const title = `${displayName}'s Rudel Wrapped`;
	const description = `${displayName} is a ${snapshot.archetypeLabel}. ${formatCompactMetric(snapshot.row.totalTokens)} tokens across ${formatCompactMetric(snapshot.row.totalSessions)} sessions. Make yours.`;
	const imageSecureUrl = getSecureImageUrl(imageUrl);

	return {
		description,
		imageAlt: `${displayName}'s Rudel Wrapped card`,
		imageHeight,
		imageSecureUrl,
		imageType,
		imageUrl,
		imageWidth,
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
	const imageSecureUrl = metadata.imageSecureUrl
		? escapeHtmlAttribute(metadata.imageSecureUrl)
		: null;
	const imageAlt = escapeHtmlAttribute(metadata.imageAlt);
	const imageHeight = Math.round(metadata.imageHeight).toString();
	const imageWidth = Math.round(metadata.imageWidth).toString();

	return [
		`    <meta property="og:type" content="website" />`,
		`    <meta property="og:site_name" content="Rudel" />`,
		`    <meta property="og:locale" content="en_US" />`,
		`    <meta property="og:title" content="${title}" />`,
		`    <meta property="og:description" content="${description}" />`,
		`    <meta property="og:url" content="${publicUrl}" />`,
		`    <meta property="og:image" content="${imageUrl}" />`,
		`    <meta property="og:image:url" content="${imageUrl}" />`,
		...(imageSecureUrl
			? [
					`    <meta property="og:image:secure_url" content="${imageSecureUrl}" />`,
				]
			: []),
		`    <meta property="og:image:type" content="${escapeHtmlAttribute(metadata.imageType)}" />`,
		`    <meta property="og:image:width" content="${imageWidth}" />`,
		`    <meta property="og:image:height" content="${imageHeight}" />`,
		`    <meta property="og:image:alt" content="${imageAlt}" />`,
		`    <meta name="twitter:card" content="summary_large_image" />`,
		`    <meta name="twitter:title" content="${title}" />`,
		`    <meta name="twitter:description" content="${description}" />`,
		`    <meta name="twitter:image" content="${imageUrl}" />`,
		`    <meta name="twitter:image:alt" content="${imageAlt}" />`,
	].join("\n");
}

function getSecureImageUrl(imageUrl: string) {
	try {
		const parsedUrl = new URL(imageUrl);

		if (parsedUrl.protocol !== "https:") {
			return undefined;
		}

		return parsedUrl.toString();
	} catch {
		return undefined;
	}
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
