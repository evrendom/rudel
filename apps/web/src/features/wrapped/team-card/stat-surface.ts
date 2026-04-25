import {
	type CSSProperties,
	type MutableRefObject,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

interface WrappedStatSurfaceStyle extends CSSProperties {
	"--wrapped-team-card-stat-surface-position"?: string;
	"--wrapped-team-card-stat-surface-size"?: string;
}

interface UseWrappedStatSurfaceStylesParams {
	bleedPx: number;
	statItems: readonly {
		key: string;
	}[];
}

interface UseWrappedStatSurfaceStylesResult {
	statSectionRef: RefObject<HTMLDivElement | null>;
	statSurfaceStyles: Record<string, WrappedStatSurfaceStyle>;
	statTileRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export function useWrappedStatSurfaceStyles(
	params: UseWrappedStatSurfaceStylesParams,
): UseWrappedStatSurfaceStylesResult {
	const { bleedPx, statItems } = params;
	const statSectionRef = useRef<HTMLDivElement | null>(null);
	const statTileRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const [statSurfaceStyles, setStatSurfaceStyles] = useState<
		Record<string, WrappedStatSurfaceStyle>
	>({});

	useLayoutEffect(() => {
		const statSectionNode = statSectionRef.current;

		if (!statSectionNode) {
			return;
		}

		const updateStatSurfaceStyles = () => {
			const renderScale = getWrappedCardRenderScale(statSectionNode);
			const sectionWidth = statSectionNode.clientWidth;
			const sectionHeight = statSectionNode.clientHeight;
			const nextStyles: Record<string, WrappedStatSurfaceStyle> = {};

			for (const stat of statItems) {
				const statTileNode = statTileRefs.current[stat.key];

				if (!statTileNode) {
					continue;
				}

				nextStyles[stat.key] = {
					"--wrapped-team-card-stat-surface-position": `${formatScaledStatSurfaceLength(
						-(statTileNode.offsetLeft + bleedPx),
						renderScale,
					)} ${formatScaledStatSurfaceLength(
						-(statTileNode.offsetTop + bleedPx),
						renderScale,
					)}`,
					"--wrapped-team-card-stat-surface-size": `${formatScaledStatSurfaceLength(
						sectionWidth + bleedPx * 2,
						renderScale,
					)} ${formatScaledStatSurfaceLength(
						sectionHeight + bleedPx * 2,
						renderScale,
					)}`,
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
	}, [bleedPx, statItems]);

	return {
		statSectionRef,
		statSurfaceStyles,
		statTileRefs,
	};
}

function getWrappedCardRenderScale(element: HTMLElement) {
	const scaleOwner =
		element.closest<HTMLElement>(".team-lineup-card-tilt-shell") ?? element;
	const parsedScale = Number.parseFloat(
		getComputedStyle(scaleOwner).getPropertyValue(
			"--wrapped-card-render-scale",
		),
	);

	if (!Number.isFinite(parsedScale) || parsedScale <= 0) {
		return 1;
	}

	return parsedScale;
}

function formatScaledStatSurfaceLength(length: number, renderScale: number) {
	const baseLength = length / renderScale;

	return `calc(var(--wrapped-card-render-scale, 1) * ${formatCssNumber(
		baseLength,
	)}px)`;
}

function formatCssNumber(value: number) {
	return value.toFixed(4).replace(/\.?0+$/, "");
}
