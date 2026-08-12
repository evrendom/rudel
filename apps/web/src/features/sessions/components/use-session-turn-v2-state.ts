import { useMemo, useState } from "react";
import { buildSessionThreadSegments } from "./session-thread-visibility";
import {
	groupTurnsIntoEpisodes,
	type SessionTurnEpisode,
} from "./session-turn-episodes";
import {
	getSessionTurnLensMatches,
	type SessionTurnLensId,
	type SessionTurnLensInput,
} from "./session-turn-lenses";
import type { SessionTurnMetric } from "./session-turn-metric";
import { useSessionTurnTableControls } from "./use-session-turn-table-controls";

export type SessionTurnV2PaneTab = "trace" | "turns";
export type SessionTurnTraceMode = "share" | "waterfall";

function getCollapsedEpisodeForIndex(
	episodes: readonly SessionTurnEpisode[],
	collapsedKeys: ReadonlySet<string>,
	index: number,
) {
	return episodes.find(
		(episode) =>
			collapsedKeys.has(episode.key) && episode.indices.includes(index),
	);
}

export function useSessionTurnV2State<TOption extends SessionTurnLensInput>({
	onSelect,
	options,
	selectedIndex,
}: {
	onSelect: (index: number) => void;
	options: readonly TOption[];
	selectedIndex: number;
}) {
	const controls = useSessionTurnTableControls({
		onSelect,
		options,
		selectedIndex,
	});
	const [activeLensId, setActiveLensId] = useState<
		SessionTurnLensId | undefined
	>();
	const [metric, setMetric] = useState<SessionTurnMetric>("cost");
	const [paneTab, setPaneTab] = useState<SessionTurnV2PaneTab>("turns");
	const [traceMode, setTraceMode] = useState<SessionTurnTraceMode>("waterfall");
	const [collapsedEpisodeKeys, setCollapsedEpisodeKeys] = useState<
		ReadonlySet<string>
	>(() => new Set());
	const [expandedHiddenKeys, setExpandedHiddenKeys] = useState<
		ReadonlySet<string>
	>(() => new Set());
	const episodes = useMemo(() => groupTurnsIntoEpisodes(options), [options]);
	const filterIndices = useMemo(
		() => new Set(controls.visibleMatches.map((match) => match.index)),
		[controls.visibleMatches],
	);
	const lensMatches = useMemo(
		() =>
			activeLensId
				? getSessionTurnLensMatches(options, activeLensId)
				: undefined,
		[activeLensId, options],
	);
	const matchedIndices = useMemo(() => {
		if (!controls.hasActiveFilters && !lensMatches) {
			return undefined;
		}

		return new Set(
			[...filterIndices].filter((index) => lensMatches?.has(index) ?? true),
		);
	}, [controls.hasActiveFilters, filterIndices, lensMatches]);
	const visibleMatches = useMemo(
		() =>
			controls.visibleMatches.filter((match) => {
				if (lensMatches && !lensMatches.has(match.index)) {
					return false;
				}
				const collapsedEpisode = getCollapsedEpisodeForIndex(
					episodes,
					collapsedEpisodeKeys,
					match.index,
				);
				return (
					collapsedEpisode === undefined ||
					collapsedEpisode.startIndex === match.index
				);
			}),
		[collapsedEpisodeKeys, controls.visibleMatches, episodes, lensMatches],
	);
	const threadSegments = useMemo(
		() =>
			buildSessionThreadSegments(
				options.length,
				matchedIndices,
				expandedHiddenKeys,
			),
		[expandedHiddenKeys, matchedIndices, options.length],
	);

	function toggleLens(lensId: SessionTurnLensId) {
		setActiveLensId((current) => (current === lensId ? undefined : lensId));
	}

	function toggleEpisode(key: string) {
		setCollapsedEpisodeKeys((current) => {
			const next = new Set(current);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}

	function toggleHiddenSegment(key: string) {
		setExpandedHiddenKeys((current) => {
			const next = new Set(current);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}

	function revealContainingEpisode(index: number) {
		const episode = getCollapsedEpisodeForIndex(
			episodes,
			collapsedEpisodeKeys,
			index,
		);
		if (episode) {
			toggleEpisode(episode.key);
		}
	}

	return {
		activeLensId,
		collapsedEpisodeKeys,
		controls,
		episodes,
		lensMatches,
		matchedIndices,
		metric,
		paneTab,
		revealContainingEpisode,
		setMetric,
		setPaneTab,
		setTraceMode,
		threadSegments,
		toggleEpisode,
		toggleHiddenSegment,
		toggleLens,
		traceMode,
		visibleMatches,
	};
}
