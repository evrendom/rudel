import { describe, expect, test } from "bun:test";
import {
	CreateWrappedShareInputSchema,
	getWrappedShareSnapshotByteLength,
	WRAPPED_SHARE_RESOURCE_LIMITS,
	type WrappedShareSnapshot,
	WrappedShareSnapshotSchema,
} from "../schemas/wrapped-share.js";

const SOCIAL_IMAGE_DATA_URL_PREFIX = "data:image/png;base64,";

describe("wrapped share snapshot resource budget", () => {
	test("accepts the maximum supported arrays and strings", () => {
		const maximumText = "x".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.textLength);
		const snapshot = createSnapshot({
			archetypeLabel: maximumText,
			backMetricCount: WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount,
			imageUrl: "x".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength),
			shellClassName: "x".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength),
			statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
			text: maximumText,
		});

		expect(getWrappedShareSnapshotByteLength(snapshot)).toBeLessThanOrEqual(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		);
		expect(WrappedShareSnapshotSchema.safeParse(snapshot).success).toBe(true);
	});

	test("rejects one item over either array limit", () => {
		const tooManyStats = createSnapshot({
			statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
		});
		const tooManyBackMetrics = createSnapshot({
			backMetricCount: WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount + 1,
		});

		expect(WrappedShareSnapshotSchema.safeParse(tooManyStats).success).toBe(
			false,
		);
		expect(
			WrappedShareSnapshotSchema.safeParse(tooManyBackMetrics).success,
		).toBe(false);
	});

	test("rejects overlong strings used by the public renderer", () => {
		const overlongText = "x".repeat(
			WRAPPED_SHARE_RESOURCE_LIMITS.textLength + 1,
		);
		const baseSnapshot = createSnapshot();
		const invalidSnapshots = [
			{ ...baseSnapshot, archetypeLabel: overlongText },
			{
				...baseSnapshot,
				backMetrics: [{ label: overlongText, value: "1" }],
			},
			{
				...baseSnapshot,
				headerLeftMetric: { label: overlongText, value: "1" },
			},
			{
				...baseSnapshot,
				row: { ...baseSnapshot.row, displayName: overlongText },
			},
			{
				...baseSnapshot,
				row: { ...baseSnapshot.row, favoriteModel: overlongText },
			},
			{
				...baseSnapshot,
				row: { ...baseSnapshot.row, lastActiveDate: overlongText },
			},
			{
				...baseSnapshot,
				row: { ...baseSnapshot.row, role: overlongText },
			},
			{
				...baseSnapshot,
				statItems: [{ key: "sessions", title: overlongText, value: "1" }],
			},
			{
				...baseSnapshot,
				shellClassName: "x".repeat(
					WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength + 1,
				),
			},
			{
				...baseSnapshot,
				row: {
					...baseSnapshot.row,
					imageUrl: "x".repeat(
						WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength + 1,
					),
				},
			},
		];

		for (const invalidSnapshot of invalidSnapshots) {
			expect(
				WrappedShareSnapshotSchema.safeParse(invalidSnapshot).success,
			).toBe(false);
		}
	});

	test("rejects individually valid fields whose aggregate is too large", () => {
		const maximumMultibyteText = "界".repeat(
			WRAPPED_SHARE_RESOURCE_LIMITS.textLength,
		);
		const snapshot = createSnapshot({
			imageUrl: "界".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength),
			backMetricCount: WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount,
			shellClassName: "界".repeat(
				WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength,
			),
			statItemCount: WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
			text: maximumMultibyteText,
		});

		expect(getWrappedShareSnapshotByteLength(snapshot)).toBeGreaterThan(
			WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes,
		);
		expect(WrappedShareSnapshotSchema.safeParse(snapshot).success).toBe(false);
	});

	test("rejects a 7.25 MiB legacy snapshot containing a 5 MiB image", () => {
		const fiveMiBImage = createSocialImageDataUrl(5 * 1024 * 1024);
		const legacySnapshot = createLegacySnapshotAtByteLength(
			createSnapshot(),
			fiveMiBImage,
			7.25 * 1024 * 1024,
		);

		expect(getWrappedShareSnapshotByteLength(legacySnapshot)).toBe(
			7.25 * 1024 * 1024,
		);
		expect(WrappedShareSnapshotSchema.safeParse(legacySnapshot).success).toBe(
			false,
		);
	});

	test("rejects oversized unknown data nested inside the snapshot", () => {
		const snapshot = createSnapshot();
		const snapshotWithUnknownRowData = {
			...snapshot,
			row: {
				...snapshot.row,
				legacyData: "x".repeat(WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes),
			},
		};

		expect(
			WrappedShareSnapshotSchema.safeParse(snapshotWithUnknownRowData).success,
		).toBe(false);
	});

	test("bounds the separately stored social image at one decoded MiB", () => {
		const snapshot = createSnapshot();
		const maximumImage = createSocialImageDataUrl(
			WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes,
		);
		const overLimitImage = createSocialImageDataUrl(
			WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes + 1,
		);

		expect(
			CreateWrappedShareInputSchema.safeParse({
				snapshot,
				socialImageDataUrl: maximumImage,
			}).success,
		).toBe(true);
		expect(
			CreateWrappedShareInputSchema.safeParse({
				snapshot,
				socialImageDataUrl: overLimitImage,
			}).success,
		).toBe(false);
	});
});

function createSnapshot(
	input: {
		archetypeLabel?: string;
		backMetricCount?: number;
		imageUrl?: string | null;
		shellClassName?: string;
		statItemCount?: number;
		text?: string;
	} = {},
): WrappedShareSnapshot {
	const text = input.text ?? "x";

	return {
		archetypeLabel: input.archetypeLabel ?? "Builder",
		backMetrics: Array.from({ length: input.backMetricCount ?? 0 }, () => ({
			label: text,
			value: text,
		})),
		headerLeftMetric: {
			label: text,
			title: text,
			value: text,
		},
		headerRightMetric: {
			label: text,
			title: text,
			value: text,
		},
		row: {
			activeDays: 6,
			cost: 42,
			displayName: text,
			favoriteModel: text,
			hasActivity: true,
			imageUrl: input.imageUrl ?? null,
			inputTokens: 120,
			lastActiveDate: text,
			outputTokens: 240,
			role: text,
			totalSessions: 12,
			totalTokens: 360,
		},
		shellClassName: input.shellClassName ?? text,
		statItems: Array.from({ length: input.statItemCount ?? 0 }, (_, index) => ({
			key: `stat-${index}`,
			label: text,
			title: text,
			value: text,
		})),
		theme: "light",
	};
}

function createSocialImageDataUrl(byteLength: number) {
	const base64Length = Math.ceil(byteLength / 3) * 4;
	const paddingLength = (3 - (byteLength % 3)) % 3;

	return (
		SOCIAL_IMAGE_DATA_URL_PREFIX +
		"A".repeat(base64Length - paddingLength) +
		"=".repeat(paddingLength)
	);
}

function createLegacySnapshotAtByteLength(
	snapshot: WrappedShareSnapshot,
	socialImageDataUrl: string,
	targetBytes: number,
) {
	const legacySnapshot = {
		...snapshot,
		padding: "",
		socialImageDataUrl,
	};
	const paddingBytes =
		targetBytes - getWrappedShareSnapshotByteLength(legacySnapshot);

	if (paddingBytes < 0) {
		throw new Error("Legacy fixture target is smaller than its social image");
	}

	return {
		...legacySnapshot,
		padding: "x".repeat(paddingBytes),
	};
}
