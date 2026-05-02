import { describe, expect, it } from "vitest";
import { resolveSkillsStageModel } from "./skills";
import { resolveToolsStageModel } from "./tools";

const emptyToolsInput = {
	slashCommandsAdoptionRate: null,
	subagentsAdoptionRate: null,
	topSlashCommand: null,
	topSlashCommandCount: null,
	topSlashCommands: [],
	topSubagent: null,
	topSubagentCount: null,
	topSubagents: [],
	totalSessions: 0,
} as const;

describe("wrapped feature signal thresholds", () => {
	it("hides skill names below 20 percent adoption", () => {
		const model = resolveSkillsStageModel({
			skillsAdoptionRate: 19,
			topSkills: [{ count: 38, name: "Refactor" }],
		});

		expect(model.emptyState).toBe("low-signal");
		expect(model.hasRankedSkills).toBe(false);
		expect(model.headline).toBe("You didn't use skills enough.");
		expect(model.subline).toBe("Use skills in 20%+ of sessions for a recap.");
		expect(model.cards.some((card) => card.item.name === "Refactor")).toBe(
			false,
		);
	});

	it("shows skill names at 20 percent adoption with enough top-skill count", () => {
		const model = resolveSkillsStageModel({
			skillsAdoptionRate: 20,
			topSkills: [{ count: 3, name: "Refactor" }],
		});

		expect(model.emptyState).toBeNull();
		expect(model.hasRankedSkills).toBe(true);
		expect(model.cards[0]?.item.name).toBe("Refactor");
	});

	it("hides slash command names below 20 percent adoption", () => {
		const model = resolveToolsStageModel({
			...emptyToolsInput,
			slashCommandsAdoptionRate: 19,
			topSlashCommand: "/fix",
			topSlashCommandCount: 38,
			topSlashCommands: [{ count: 38, name: "/fix" }],
			totalSessions: 100,
		});

		expect(model.mode).toBe("thin-slash-command");
		expect(model.topSlashCommand).toBeNull();
		expect(model.headline).toBe("You didn't use slash commands enough.");
		expect(model.subline).toBe(
			"Use slash commands in 20%+ of sessions for a recap.",
		);
		expect(model.entries.some((entry) => entry.name === "/fix")).toBe(false);
	});

	it("shows slash command names at 20 percent adoption with enough top-command count", () => {
		const model = resolveToolsStageModel({
			...emptyToolsInput,
			slashCommandsAdoptionRate: 20,
			topSlashCommand: "/fix",
			topSlashCommandCount: 3,
			topSlashCommands: [{ count: 3, name: "/fix" }],
			totalSessions: 15,
		});

		expect(model.mode).toBe("regular");
		expect(model.topSlashCommand).toBe("/fix");
		expect(model.entries[0]?.name).toBe("/fix");
	});
});
