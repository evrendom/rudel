import { describe, expect, test } from "bun:test";
import {
	buildSessionJsonlPresentation,
	isSessionDetailExperimentTab,
	SESSION_DETAIL_EXPERIMENT_TABS,
} from "./session-detail-experiment-tabs";

describe("session detail experiment tabs", () => {
	test("keeps the three session representations in display order", () => {
		expect(SESSION_DETAIL_EXPERIMENT_TABS).toEqual([
			{ label: "Turn table", value: "turn-table" },
			{ label: "Conversation", value: "conversation" },
			{ label: "JSONL", value: "jsonl" },
		]);
	});

	test("accepts only supported tab values", () => {
		expect(isSessionDetailExperimentTab("turn-table")).toBe(true);
		expect(isSessionDetailExperimentTab("conversation")).toBe(true);
		expect(isSessionDetailExperimentTab("jsonl")).toBe(true);
		expect(isSessionDetailExperimentTab("overview")).toBe(false);
		expect(isSessionDetailExperimentTab(undefined)).toBe(false);
	});

	test("formats valid records and preserves malformed records", () => {
		const content = [
			JSON.stringify({ message: { content: "Hello" }, type: "user" }),
			"",
			"not-json",
		].join("\n");

		expect(buildSessionJsonlPresentation(content)).toEqual({
			formattedContent: [
				"{",
				'  "message": {',
				'    "content": "Hello"',
				"  },",
				'  "type": "user"',
				"}",
				"",
				"not-json",
			].join("\n"),
			recordCount: 2,
		});
	});
});
