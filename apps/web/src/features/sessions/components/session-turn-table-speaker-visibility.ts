import type { SessionTurnTableSpeaker } from "./session-turn-table";

export type SessionTurnTableSpeakerSelection = {
	primarySpeaker: SessionTurnTableSpeaker;
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>;
};

export function toggleSessionTurnTableSpeakerVisibility({
	primarySpeaker,
	speaker,
	visibleSpeakers,
}: {
	primarySpeaker: SessionTurnTableSpeaker;
	speaker: SessionTurnTableSpeaker;
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>;
}): SessionTurnTableSpeakerSelection {
	if (visibleSpeakers.size === 1) {
		if (visibleSpeakers.has(speaker)) {
			return { primarySpeaker, visibleSpeakers };
		}
		return {
			primarySpeaker,
			visibleSpeakers: new Set([...visibleSpeakers, speaker]),
		};
	}

	const nextSpeakers = new Set(visibleSpeakers);
	if (nextSpeakers.has(speaker)) {
		nextSpeakers.delete(speaker);
	} else {
		nextSpeakers.add(speaker);
	}
	return {
		primarySpeaker:
			primarySpeaker === speaker
				? speaker === "model"
					? "member"
					: "model"
				: primarySpeaker,
		visibleSpeakers: nextSpeakers,
	};
}
