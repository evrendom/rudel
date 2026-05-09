import { describe, expect, test } from "bun:test";
import type {
	PublicWrappedShare,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import {
	buildWrappedShareCardSvg,
	getWrappedShareCardImageMetadata,
	getWrappedShareCardImagePng,
	renderWrappedShareCardPng,
} from "../services/wrapped-share-card-image.js";
import {
	buildWrappedSharePageMetadata,
	injectWrappedSharePageMetadata,
} from "../services/wrapped-share-page-metadata.js";

const SAMPLE_DATA_IMAGE =
	"data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
const SAMPLE_SOCIAL_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const sampleSnapshot: WrappedShareSnapshot = {
	appearance: {
		layoutMode: "front_back",
		showArchetypeLabel: true,
	},
	archetypeLabel: "Maniac",
	backMetrics: [
		{ label: "Input tokens", value: "1.2M" },
		{ label: "Output tokens", value: "740K" },
	],
	row: {
		activeDays: 12,
		cost: 123,
		displayName: "Evren <Dombak>",
		favoriteModel: "Claude Sonnet",
		hasActivity: true,
		imageUrl: SAMPLE_DATA_IMAGE,
		inputTokens: 1_200_000,
		lastActiveDate: "2026-04-25",
		outputTokens: 740_000,
		role: "Founder",
		totalSessions: 219,
		totalTokens: 1_940_000,
	},
	shellClassName: "team-lineup-card-shell--maniac",
	statItems: [
		{ key: "tokens", label: "total tokens", value: "1.9M" },
		{ key: "sessions", label: "sessions", value: "219" },
	],
	theme: "muted",
};

const sampleShare: PublicWrappedShare = {
	created_at: "2026-04-25T10:00:00.000Z",
	expires_at: "2026-05-25T10:00:00.000Z",
	id: "11111111-1111-4111-8111-111111111111",
	snapshot: sampleSnapshot,
	variant: "normal",
};

describe("wrapped share card image", () => {
	test("renders the saved snapshot into a PNG buffer", () => {
		const png = renderWrappedShareCardPng(sampleSnapshot);

		expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(png.byteLength).toBeGreaterThan(10_000);
	});

	test("keeps share-safe uploaded profile images in the generated SVG", () => {
		const svg = buildWrappedShareCardSvg(sampleSnapshot);

		expect(svg).toContain(SAMPLE_DATA_IMAGE);
		expect(svg).toContain("Evren &lt;Dombak&gt;");
		expect(svg).toContain("Maniac");
	});

	test("serves only the browser-captured social image for OG cards", () => {
		const snapshot = {
			...sampleSnapshot,
			socialImageDataUrl: SAMPLE_SOCIAL_IMAGE_DATA_URL,
		};
		const png = getWrappedShareCardImagePng(snapshot);

		expect(png).not.toBeNull();
		expect([...(png ?? new Uint8Array()).subarray(0, 8)]).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		expect(getWrappedShareCardImageMetadata(snapshot)).toEqual({
			height: 1,
			type: "image/png",
			width: 1,
		});
	});

	test("does not fall back to the server SVG card for OG images", () => {
		expect(getWrappedShareCardImagePng(sampleSnapshot)).toBeNull();
		expect(getWrappedShareCardImageMetadata(sampleSnapshot)).toBeNull();
	});
});

describe("wrapped share page metadata", () => {
	test("injects crawler-visible X and OG card tags into index HTML", () => {
		const metadata = buildWrappedSharePageMetadata({
			imageUrl:
				"http://localhost:5173/wrapped/11111111-1111-4111-8111-111111111111/x-card.png",
			publicUrl:
				"http://localhost:5173/wrapped/11111111-1111-4111-8111-111111111111",
			share: sampleShare,
		});
		const html = injectWrappedSharePageMetadata(
			[
				"<html>",
				"<head>",
				'<meta name="description" content="generic" />',
				"<title>Rudel</title>",
				"</head>",
				"<body></body>",
				"</html>",
			].join(""),
			metadata,
		);

		expect(html).toContain(
			"<title>Evren &lt;Dombak&gt;'s Rudel Wrapped</title>",
		);
		expect(html).toContain('name="twitter:card" content="summary_large_image"');
		expect(html).toContain(
			'name="twitter:image" content="http://localhost:5173/wrapped/11111111-1111-4111-8111-111111111111/x-card.png"',
		);
		expect(html).toContain("Evren &lt;Dombak&gt; is a Maniac.");
	});

	test("omits social image tags when no captured share image exists", () => {
		const metadata = buildWrappedSharePageMetadata({
			publicUrl:
				"http://localhost:5173/wrapped/11111111-1111-4111-8111-111111111111",
			share: sampleShare,
		});
		const html = injectWrappedSharePageMetadata(
			[
				"<html>",
				"<head>",
				'<meta name="description" content="generic" />',
				"<title>Rudel</title>",
				"</head>",
				"<body></body>",
				"</html>",
			].join(""),
			metadata,
		);

		expect(html).toContain('property="og:title"');
		expect(html).not.toContain("og:image");
		expect(html).not.toContain("twitter:image");
	});
});
