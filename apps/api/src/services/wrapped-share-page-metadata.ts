import type { PublicWrappedShare } from "@rudel/api-routes";

const OPEN_GRAPH_HTML_PREFIX = "og: https://ogp.me/ns#";
const WRAPPED_SHARE_IMAGE_HEIGHT = 630;
const WRAPPED_SHARE_IMAGE_TYPE = "image/png";
const WRAPPED_SHARE_IMAGE_WIDTH = 1200;

interface WrappedSharePageMetadata {
	description: string;
	imageAlt?: string;
	imageHeight?: number;
	imageSecureUrl?: string;
	imageType?: string;
	imageUrl?: string;
	imageWidth?: number;
	publicUrl: string;
	title: string;
}

export function buildWrappedSharePageMetadata(input: {
	imageHeight?: number;
	imageType?: string;
	imageUrl?: string;
	imageWidth?: number;
	publicUrl: string;
	share: PublicWrappedShare;
}): WrappedSharePageMetadata {
	const {
		imageHeight = WRAPPED_SHARE_IMAGE_HEIGHT,
		imageType = WRAPPED_SHARE_IMAGE_TYPE,
		imageUrl,
		imageWidth = WRAPPED_SHARE_IMAGE_WIDTH,
		publicUrl,
		share,
	} = input;
	const { snapshot } = share;
	const displayName = snapshot.row.displayName;
	const title = `${displayName}'s Rudel Wrapped`;
	const description = `${displayName} is a ${snapshot.archetypeLabel}. ${formatCompactMetric(snapshot.row.totalTokens)} tokens across ${formatCompactMetric(snapshot.row.totalSessions)} sessions. Make yours.`;
	const baseMetadata = {
		description,
		publicUrl,
		title,
	};

	if (!imageUrl) {
		return baseMetadata;
	}

	const imageSecureUrl = getSecureImageUrl(imageUrl);

	return {
		...baseMetadata,
		imageAlt: `${displayName}'s Rudel Wrapped card`,
		imageHeight,
		imageType: imageType || WRAPPED_SHARE_IMAGE_TYPE,
		imageUrl,
		imageWidth,
		...(imageSecureUrl ? { imageSecureUrl } : {}),
	};
}

export function injectWrappedSharePageMetadata(
	indexHtml: string,
	metadata: WrappedSharePageMetadata,
) {
	const htmlWithTitle = removeSocialPreviewMetadata(indexHtml)
		.replace(
			/<title>.*?<\/title>/iu,
			`<title>${escapeHtml(metadata.title)}</title>`,
		)
		.replace(
			/<meta\s+name=["']description["'][^>]*>\s*/iu,
			`<meta name="description" content="${escapeHtmlAttribute(metadata.description)}" />\n    `,
		);
	const htmlWithOpenGraphPrefix = addOpenGraphHtmlPrefix(htmlWithTitle);

	return htmlWithOpenGraphPrefix.replace(
		/<head\b([^>]*)>/iu,
		(headTag) => `${headTag}\n${buildWrappedShareMetadataTags(metadata)}`,
	);
}

function removeSocialPreviewMetadata(indexHtml: string) {
	return indexHtml.replace(
		/[ \t]*<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>\s*/giu,
		"",
	);
}

function addOpenGraphHtmlPrefix(indexHtml: string) {
	return indexHtml.replace(/<html\b([^>]*)>/iu, (htmlTag, attributes) => {
		const prefixMatch = /\sprefix=(["'])(.*?)\1/iu.exec(attributes);

		if (!prefixMatch) {
			return `<html${attributes} prefix="${OPEN_GRAPH_HTML_PREFIX}">`;
		}

		const prefixAttribute = prefixMatch[0];
		const quote = prefixMatch[1] ?? '"';
		const prefixValue = prefixMatch[2] ?? "";

		if (prefixValue.includes(OPEN_GRAPH_HTML_PREFIX)) {
			return htmlTag;
		}

		const nextPrefixValue =
			`${prefixValue.trim()} ${OPEN_GRAPH_HTML_PREFIX}`.trim();

		return htmlTag.replace(
			prefixAttribute,
			` prefix=${quote}${nextPrefixValue}${quote}`,
		);
	});
}

function buildWrappedShareMetadataTags(metadata: WrappedSharePageMetadata) {
	const title = escapeHtmlAttribute(metadata.title);
	const description = escapeHtmlAttribute(metadata.description);
	const publicUrl = escapeHtmlAttribute(metadata.publicUrl);
	const baseTags = [
		`    <meta property="og:type" content="website" />`,
		`    <meta property="og:site_name" content="Rudel" />`,
		`    <meta property="og:locale" content="en_US" />`,
		`    <meta property="og:title" content="${title}" />`,
		`    <meta property="og:description" content="${description}" />`,
		`    <meta property="og:url" content="${publicUrl}" />`,
	];

	if (!metadata.imageUrl) {
		return baseTags.join("\n");
	}

	const imageUrl = escapeHtmlAttribute(metadata.imageUrl);
	const imageSecureUrl = metadata.imageSecureUrl
		? escapeHtmlAttribute(metadata.imageSecureUrl)
		: null;
	const imageAlt = escapeHtmlAttribute(metadata.imageAlt ?? metadata.title);
	const imageHeight = Math.round(
		metadata.imageHeight ?? WRAPPED_SHARE_IMAGE_HEIGHT,
	).toString();
	const imageWidth = Math.round(
		metadata.imageWidth ?? WRAPPED_SHARE_IMAGE_WIDTH,
	).toString();

	return [
		...baseTags,
		`    <meta property="og:image" content="${imageUrl}" />`,
		`    <meta property="og:image:url" content="${imageUrl}" />`,
		...(imageSecureUrl
			? [
					`    <meta property="og:image:secure_url" content="${imageSecureUrl}" />`,
				]
			: []),
		`    <meta property="og:image:type" content="${escapeHtmlAttribute(metadata.imageType ?? WRAPPED_SHARE_IMAGE_TYPE)}" />`,
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
