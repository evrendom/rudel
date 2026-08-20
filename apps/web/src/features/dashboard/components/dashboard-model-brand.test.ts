import { describe, expect, it } from "vitest";
import {
	formatModelDisplayLabel,
	getModelBadgeTone,
} from "./dashboard-model-brand";

describe("dashboard model branding", () => {
	it.each([
		["fable", "claude", "Fable"],
		["mythos-5", "claude", "Mythos 5"],
		["claude-opus-4.1", "claude", "Opus 4.1"],
		["gpt-5.6-sol", "codex", "GPT 5.6 Sol"],
		["gpt-5.6-terra", "codex", "GPT 5.6 Terra"],
		["gpt-5.6-luna", "codex", "GPT 5.6 Luna"],
		["gpt-5.6-cyber", "codex", "GPT 5.6 Cyber"],
		["gpt-5.4-mini", "codex", "GPT 5.4 Mini"],
		["gpt-5.4-nano", "codex", "GPT 5.4 Nano"],
		["gpt-5.3-codex-spark", "codex", "GPT 5.3 Codex Spark"],
		["gpt-daybreak-blue-latest", "codex", "GPT Daybreak Blue"],
		["gpt-daybreak-red-latest", "codex", "GPT Daybreak Red"],
		["chat-latest", "codex", "Chat Latest"],
		["o3", "codex", "o3"],
		["o4-mini", "codex", "o4 mini"],
	] as const)("brands %s without losing its variant", (model, icon, label) => {
		expect(getModelBadgeTone(model).icon).toBe(icon);
		expect(formatModelDisplayLabel(model)).toBe(label);
	});

	it("recognizes provider-prefixed OpenAI model ids", () => {
		expect(getModelBadgeTone("openai/gpt-5.6-terra").icon).toBe("codex");
		expect(formatModelDisplayLabel("openai/gpt-5.6-terra")).toBe(
			"GPT 5.6 Terra",
		);
	});
});
