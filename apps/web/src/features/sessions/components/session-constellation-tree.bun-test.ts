import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	getConversationTraceTreeBranchPath,
	getConversationTraceTreeX,
} from "@/components/conversation/conversation-trace-tree-geometry";

describe("session constellation tree tokens", () => {
	test("uses Interfere rails and typography without changing tree geometry", () => {
		const css = readFileSync(
			new URL("./session-constellation-tree.css", import.meta.url),
			"utf8",
		);
		const opalineTraceFill = readFileSync(
			new URL("../../../../public/opaline-trace-fill.svg", import.meta.url),
			"utf8",
		);

		expect(css).toContain("--conversation-trace-connector-width: 0.5");
		expect(css).toContain(
			"--active-turn-rail-width: var(--conversation-trace-connector-width)",
		);
		expect(css).toContain("--active-turn-rail: #f9233b");
		expect(css).toContain('[data-active-rail-position="middle"]');
		expect(css).toContain("stroke-width: var(--active-turn-rail-width)");
		expect(css).toContain("transform: scale(1.5)");
		expect(css).toContain("color(display-p3 0 0 0 / 60.8%)");
		expect(css).toContain('font-family: "Inter Variable"');
		expect(css).toContain(
			"[data-trace-preview]:not([data-trace-shell-command-preview])",
		);
		expect(css).toContain("font-size: 12px");
		expect(css).toContain("line-height: 16px");
		expect(css).toContain("width: 20px");
		expect(css).toContain("width: 14px");
		expect(css).toContain("border-radius: 0");
		expect(css).toContain("--trace-icon-grass-bg: oklch(0.94 0.045 145)");
		expect(css).toContain("--trace-icon-violet-fg: #2400b7a9");
		expect(css).toContain("--trace-icon-claude-fg: #cc7d5e");
		expect(css).toContain("--trace-icon-openai-fg: #111111");
		expect(css).toContain('data-trace-icon-tone="claude"');
		expect(css).toContain('data-trace-icon-tone="openai"');
		expect(css).toContain('data-trace-icon-tone="tomato"');
		for (const toolIcon of [
			"bot",
			"file",
			"globe",
			"list",
			"pencil",
			"search",
			"sparkle",
			"terminal",
			"wrench",
		]) {
			expect(css).toContain(`data-trace-tool-icon="${toolIcon}"`);
		}
		expect(css).toContain("0.72 var(--trace-tool-icon-light-chroma)");
		expect(css).toContain("0.82 var(--trace-tool-icon-dark-chroma)");
		expect(css).toContain(
			"0.94 var(--trace-tool-icon-pastel-chroma) var(--trace-tool-icon-hue)",
		);
		expect(css).toContain(
			"0.31 var(--trace-tool-icon-pastel-chroma) var(--trace-tool-icon-hue)",
		);
		const iconBackgrounds = [
			...css.matchAll(/--trace-icon(?:-[a-z]+)?-bg:\s*([^;]+);/g),
		].map((match) => match[1]?.trim() ?? "");
		expect(iconBackgrounds.length).toBeGreaterThan(0);
		for (const background of iconBackgrounds) {
			expect(background).not.toMatch(/\/[\s\d.]+%?\)?$/);
			expect(background).not.toMatch(/#[\da-f]{4}(?:[\da-f]{4})?$/i);
		}
		expect(css).toContain('url("/opaline-trace-fill.svg")');
		expect(css).not.toContain('data-trace-icon-tone="opaline"');
		expect(opalineTraceFill.match(/<path\b/g)).toHaveLength(1);
		expect(opalineTraceFill).not.toContain("M524.518 229.469");
		expect(css).not.toContain("--conversation-trace-tree-padding");
		expect(css).not.toContain("position: sticky");
	});

	test("uses the hero metadata hierarchy for request token rows", () => {
		const css = readFileSync(
			new URL("./session-constellation-tree.css", import.meta.url),
			"utf8",
		);

		expect(css).toContain("[data-trace-request-metadata]");
		expect(css).toContain("[data-trace-request-separator]");
		expect(css).toContain("color: var(--constellation-tree-disabled)");
		expect(css).toContain("font-variant-numeric: tabular-nums");
		expect(css).toContain("letter-spacing: normal");
		expect(css).toContain("[data-trace-model-label]");
		expect(css).toContain("[data-session-turn-metadata-tags]");
		expect(css).toContain("+ span::before");
		expect(css).toContain('content: "·"');
	});

	test("does not paint hover fills behind trace rows", () => {
		const css = readFileSync(
			new URL("./session-constellation-tree.css", import.meta.url),
			"utf8",
		);
		const responsePane = readFileSync(
			new URL("./session-turn-response-pane.tsx", import.meta.url),
			"utf8",
		);

		expect(css).not.toContain("--constellation-tree-hover");
		expect(css).not.toContain("[data-trace-hover-row]::before");
		expect(css).not.toContain("data-trace-prose-hover");
		expect(css).not.toContain("[data-trace-hover-row] {\n\theight:");
		expect(responsePane).toContain("overflow-x-hidden overflow-y-auto");
	});

	test("preserves the hero code-card surfaces inside sticky trace rows", () => {
		const css = readFileSync(
			new URL("./session-constellation-tree.css", import.meta.url),
			"utf8",
		);
		const traceClassNames = readFileSync(
			new URL(
				"../../../components/conversation/conversation-trace-class-names.ts",
				import.meta.url,
			),
			"utf8",
		);

		expect(css).toContain("[data-trace-code-github-icon]");
		expect(css).toContain("background: #000 !important");
		expect(css).toContain("border-color: rgba(0, 0, 0, 0.06) !important");
		expect(css).toContain('[data-trace-code-line-kind="deletion"]');
		expect(css).toContain('[data-trace-code-line-kind="addition"]');
		expect(traceClassNames).toContain(":not([data-trace-code-block]_*)");
	});

	test("uses Interfere's split vertical rail with no branch elbow", () => {
		const continuingPath = getConversationTraceTreeBranchPath({
			continues: true,
			currentX: 37,
			elbowY: 20,
			style: "interfere",
			width: 29,
		});
		const terminalPath = getConversationTraceTreeBranchPath({
			continues: false,
			currentX: 37,
			elbowY: 20,
			style: "interfere",
			width: 29,
		});
		const originalPath = getConversationTraceTreeBranchPath({
			continues: true,
			currentX: 16,
			elbowY: 20,
			style: "curved",
			width: 29,
		});

		expect(getConversationTraceTreeX(1, "interfere")).toBe(37);
		expect(getConversationTraceTreeX(2, "interfere")).toBe(60);
		expect(continuingPath).toBeUndefined();
		expect(terminalPath).toBe("M 37 0 V 8");
		expect(terminalPath).not.toContain("H");
		expect(terminalPath).not.toContain("Q");
		expect(originalPath).toContain("Q");
	});

	test("uses the screenshot's original tree indentation with straight Interfere rails", () => {
		const continuingPath = getConversationTraceTreeBranchPath({
			continues: true,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch",
			width: 29,
		});
		const terminalPath = getConversationTraceTreeBranchPath({
			continues: false,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch",
			width: 29,
		});

		expect(getConversationTraceTreeX(1, "interfere-branch")).toBe(16);
		expect(getConversationTraceTreeX(2, "interfere-branch")).toBe(39);
		expect(continuingPath).toBe("M 16 20 H 28");
		expect(terminalPath).toBe("M 16 0 V 20 H 28");
	});

	test("uses the hero marker slot above and below each four-pixel dot", () => {
		const continuingPath = getConversationTraceTreeBranchPath({
			continues: true,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch-dots",
			width: 29,
		});
		const terminalPath = getConversationTraceTreeBranchPath({
			continues: false,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch-dots",
			width: 29,
		});

		expect(continuingPath).toBe("M 22 20 H 28");
		expect(terminalPath).toBe("M 16 0 V 14 M 22 20 H 28");
		expect(getConversationTraceTreeX(1, "interfere-branch-dots")).toBe(16);
		expect(getConversationTraceTreeX(2, "interfere-branch-dots")).toBe(39);
		expect(getConversationTraceTreeX(3, "interfere-branch-dots")).toBe(62);
	});

	test("removes only the horizontal branch segment in the comparison style", () => {
		const continuingPath = getConversationTraceTreeBranchPath({
			continues: true,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch-dots-no-horizontal",
			width: 29,
		});
		const terminalPath = getConversationTraceTreeBranchPath({
			continues: false,
			currentX: 16,
			elbowY: 20,
			style: "interfere-branch-dots-no-horizontal",
			width: 29,
		});

		expect(continuingPath).toBeUndefined();
		expect(terminalPath).toBe("M 16 0 V 14");
		expect(
			getConversationTraceTreeX(2, "interfere-branch-dots-no-horizontal"),
		).toBe(39);
	});
});
