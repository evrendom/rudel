import { describe, expect, test } from "bun:test";
import {
	groupTurnsIntoEpisodes,
	startsNewEpisode,
} from "./session-turn-episodes";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

describe("session turn episodes", () => {
	test("starts episodes for a new intent, command, compaction, and long gap", () => {
		const previous = createSessionTurnV2TestOption();
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnV2TestOption({
					memberText: "Build a new analytics view please",
				}),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnV2TestOption({ slashCommands: ["review"] }),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnV2TestOption({
					compactionsBefore: [
						{ key: "compaction", timestamp: "2026-08-11T10:02:00.000Z" },
					],
				}),
			),
		).toBe(true);
		expect(
			startsNewEpisode(
				previous,
				createSessionTurnV2TestOption({
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
			createSessionTurnV2TestOption({ memberText: "", turnNumber: undefined }),
			createSessionTurnV2TestOption({
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
