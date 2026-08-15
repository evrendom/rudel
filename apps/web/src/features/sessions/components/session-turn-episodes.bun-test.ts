import { describe, expect, test } from "bun:test";
import {
	groupTurnsIntoEpisodes,
	startsNewEpisode,
} from "./session-turn-episodes";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

describe("session turn episodes", () => {
	test("starts episodes for a new intent, command, compaction, and long gap", () => {
		const previous = createSessionTurnTestOption();
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnTestOption({
					memberText: "Build a new analytics view please",
				}),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnTestOption({ slashCommands: ["review"] }),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnTestOption({
					compactionsBefore: [
						{ key: "compaction", timestamp: "2026-08-11T10:02:00.000Z" },
					],
				}),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnTestOption({
					memberText: "continue",
					timing: {
						...previous.timing,
						startTimestamp: "2026-08-11T11:00:00.000Z",
					},
				}),
			),
		).toBe(true);
	});

	test("keeps short continuations together and folds the preamble into episode one", () => {
		const options = [
			createSessionTurnTestOption({ memberText: "", turnNumber: undefined }),
			createSessionTurnTestOption({
				key: "turn-2",
				memberText: "ok",
				turnNumber: 1,
			}),
		];
		const episodes = groupTurnsIntoEpisodes(options);
		expect(episodes).toHaveLength(1);
		expect(episodes[0]?.indices).toEqual([0, 1]);
	});
});
