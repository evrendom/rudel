import {
	compactPreview,
	type TraceItem,
	userContentText,
} from "./conversation-trace.js";

export type SessionTurn = {
	responseItems: TraceItem[];
	userItems: TraceItem[];
};

export function getSessionTurnId(turn: SessionTurn) {
	const userAnchor = turn.userItems.find((item) => item.kind === "user");
	if (userAnchor) {
		return userAnchor.id;
	}

	const responseAnchor = turn.responseItems[0];
	if (responseAnchor) {
		return responseAnchor.id;
	}

	throw new Error("Cannot identify an empty session turn");
}

function getTurnStartTimestamp(turn: SessionTurn) {
	const userTimestamp = turn.userItems.at(0)?.timestamp;
	if (userTimestamp) {
		return userTimestamp;
	}

	for (const item of turn.responseItems) {
		if (item.timestamp) {
			return item.timestamp;
		}
	}

	return undefined;
}

function getTurnEndMessageTimestamp(turn: SessionTurn) {
	for (
		let itemIndex = turn.responseItems.length - 1;
		itemIndex >= 0;
		itemIndex--
	) {
		const item = turn.responseItems[itemIndex];
		if (item?.kind !== "agent") {
			continue;
		}

		for (
			let eventIndex = item.events.length - 1;
			eventIndex >= 0;
			eventIndex--
		) {
			const event = item.events[eventIndex];
			if (event?.kind === "message") {
				return event.timestamp;
			}
		}
	}

	return undefined;
}

function formatTurnDuration(totalSeconds: number) {
	if (totalSeconds < 60) {
		return `${Math.round(totalSeconds)} sec`;
	}

	if (totalSeconds < 3_600) {
		return `${Math.round(totalSeconds / 60)} min`;
	}

	const hours = totalSeconds / 3_600;
	const roundedHours = Math.round(hours * 10) / 10;
	return `${roundedHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hr`;
}

export function getSessionTurnTiming(turn: SessionTurn) {
	const startTimestamp = getTurnStartTimestamp(turn);
	const endTimestamp = getTurnEndMessageTimestamp(turn);
	const startTime = startTimestamp ? Date.parse(startTimestamp) : Number.NaN;
	const endTime = endTimestamp ? Date.parse(endTimestamp) : Number.NaN;
	const durationSeconds =
		Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime
			? undefined
			: (endTime - startTime) / 1_000;

	return {
		durationSeconds,
		durationLabel:
			durationSeconds === undefined
				? undefined
				: formatTurnDuration(durationSeconds),
		endTimestamp,
		startTimestamp,
	};
}

export function getSessionTurnPreview(turn: SessionTurn) {
	for (
		let itemIndex = turn.responseItems.length - 1;
		itemIndex >= 0;
		itemIndex--
	) {
		const item = turn.responseItems[itemIndex];
		if (item?.kind !== "agent") {
			continue;
		}

		for (
			let eventIndex = item.events.length - 1;
			eventIndex >= 0;
			eventIndex--
		) {
			const event = item.events[eventIndex];
			if (event?.kind !== "message") {
				continue;
			}

			const preview = compactPreview(event.text, 240);
			if (preview) {
				return preview;
			}
		}
	}

	return "No assistant message";
}

export function getSessionTurnMemberText(turn: SessionTurn) {
	return turn.userItems
		.flatMap((item) =>
			item.kind === "user" ? [userContentText(item.content)] : [],
		)
		.filter(Boolean)
		.join("\n");
}

export function getSessionTurnMemberPreview(turn: SessionTurn) {
	const memberText = getSessionTurnMemberText(turn);
	return compactPreview(memberText, 240) || "No member message";
}

export function groupTraceIntoTurns(items: TraceItem[]): SessionTurn[] {
	const turns: SessionTurn[] = [];
	let currentTurn: SessionTurn | undefined;

	for (const item of items) {
		if (item.kind === "user") {
			if (
				currentTurn &&
				currentTurn.userItems.length > 0 &&
				currentTurn.responseItems.length === 0
			) {
				currentTurn.userItems.push(item);
				continue;
			}

			currentTurn = {
				responseItems: [],
				userItems: [item],
			};
			turns.push(currentTurn);
			continue;
		}

		if (!currentTurn) {
			currentTurn = {
				responseItems: [],
				userItems: [],
			};
			turns.push(currentTurn);
		}

		currentTurn.responseItems.push(item);
	}

	return turns;
}
