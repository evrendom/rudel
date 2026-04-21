import {
	type CSSProperties,
	type MutableRefObject,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

interface WalkInStatSurfaceStyle extends CSSProperties {
	"--walk-in-team-card-stat-surface-position"?: string;
	"--walk-in-team-card-stat-surface-size"?: string;
}

interface UseWalkInStatSurfaceStylesParams {
	bleedPx: number;
	statItems: readonly {
		key: string;
	}[];
}

interface UseWalkInStatSurfaceStylesResult {
	statSectionRef: RefObject<HTMLDivElement | null>;
	statSurfaceStyles: Record<string, WalkInStatSurfaceStyle>;
	statTileRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export function useWalkInStatSurfaceStyles(
	params: UseWalkInStatSurfaceStylesParams,
): UseWalkInStatSurfaceStylesResult {
	const { bleedPx, statItems } = params;
	const statSectionRef = useRef<HTMLDivElement | null>(null);
	const statTileRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const [statSurfaceStyles, setStatSurfaceStyles] = useState<
		Record<string, WalkInStatSurfaceStyle>
	>({});

	useLayoutEffect(() => {
		const statSectionNode = statSectionRef.current;

		if (!statSectionNode) {
			return;
		}

		const updateStatSurfaceStyles = () => {
			const sectionWidth = statSectionNode.clientWidth;
			const sectionHeight = statSectionNode.clientHeight;
			const nextStyles: Record<string, WalkInStatSurfaceStyle> = {};

			for (const stat of statItems) {
				const statTileNode = statTileRefs.current[stat.key];

				if (!statTileNode) {
					continue;
				}

				nextStyles[stat.key] = {
					"--walk-in-team-card-stat-surface-position": `-${statTileNode.offsetLeft + bleedPx}px -${statTileNode.offsetTop + bleedPx}px`,
					"--walk-in-team-card-stat-surface-size": `${sectionWidth + bleedPx * 2}px ${sectionHeight + bleedPx * 2}px`,
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
