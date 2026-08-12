import { type RefObject, useMemo, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { buildConversationTrace } from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import {
	SessionTurnStrip,
	type SessionTurnStripOption,
} from "./session-turn-strip";
import { getSessionTurnPreview, groupTraceIntoTurns } from "./session-turns";

interface NormalSessionTurnStripOption extends SessionTurnStripOption {
	anchorId: string;
}

function buildNormalSessionTurnStripOptions(
	content: string,
): NormalSessionTurnStripOption[] {
	const traceItems = buildConversationTrace(parseConversations(content));
	const traceIndexById = new Map(
		traceItems.map((item, index) => [item.id, index]),
	);

	return groupTraceIntoTurns(traceItems).flatMap((turn) => {
		const firstUserItem = turn.userItems.at(0);
		if (!firstUserItem) {
			return [];
		}

		const traceIndex = traceIndexById.get(firstUserItem.id);
		if (traceIndex === undefined) {
			return [];
		}

		return [
			{
				anchorId: `message-${traceIndex}`,
				key: firstUserItem.id,
				preview: getSessionTurnPreview(turn),
			},
		];
	});
}

export function NormalSessionTurnStrip({
	className,
	content,
	scrollContainerRef,
}: {
	className?: string;
	content: string;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
	const options = useMemo(
		() => buildNormalSessionTurnStripOptions(content),
		[content],
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const boundedSelectedIndex = Math.min(
		selectedIndex,
		Math.max(options.length - 1, 0),
	);

	useMountEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer || options.length === 0) {
			return;
		}

		function syncSelectedTurn() {
			if (!scrollContainer) {
				return;
			}

			if (
				scrollContainer.scrollHeight -
					scrollContainer.scrollTop -
					scrollContainer.clientHeight <=
				2
			) {
				setSelectedIndex(options.length - 1);
				return;
			}

			const activationLine =
				scrollContainer.getBoundingClientRect().top +
				Math.min(scrollContainer.clientHeight * 0.35, 180);
			let nextIndex = 0;

			for (const [index, option] of options.entries()) {
				const target = scrollContainer.querySelector<HTMLElement>(
					`#${option.anchorId}`,
				);
				if (!target || target.getBoundingClientRect().top > activationLine) {
					break;
				}

				nextIndex = index;
			}

			setSelectedIndex(nextIndex);
		}

		syncSelectedTurn();
		scrollContainer.addEventListener("scroll", syncSelectedTurn, {
			passive: true,
		});

		return () =>
			scrollContainer.removeEventListener("scroll", syncSelectedTurn);
	});

	function handleSelect(index: number) {
		const option = options[index];
		const scrollContainer = scrollContainerRef.current;
		if (!option || !scrollContainer) {
			return;
		}

		setSelectedIndex(index);
		const target = scrollContainer.querySelector<HTMLElement>(
			`#${option.anchorId}`,
		);
		const reduceMotion =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		target?.scrollIntoView({
			behavior: reduceMotion ? "auto" : "smooth",
			block: "center",
			inline: "nearest",
		});
	}

	if (options.length === 0) {
		return null;
	}

	return (
		<SessionTurnStrip
			activationMode="rail"
			className={className}
			onSelect={handleSelect}
			options={options}
			selectedIndex={boundedSelectedIndex}
		/>
	);
}
