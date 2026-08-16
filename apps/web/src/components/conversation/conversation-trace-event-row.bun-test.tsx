import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { formatShellOutput } from "./conversation-tools";
import {
	ConversationTraceEventRow,
	ShellToolCallBody,
	ToolCallBody,
	ToolResultBody,
} from "./conversation-trace-event-row";

describe("formatShellOutput", () => {
	test("unwraps a JSON body envelope into natural multiline output", () => {
		expect(
			formatShellOutput(
				JSON.stringify({
					body: "## Summary\n- first receipt\n- second receipt",
					headRefName: "feat/rate-card",
					state: "OPEN",
				}),
			),
		).toEqual({
			language: "text",
			text: "## Summary\n- first receipt\n- second receipt",
		});
	});

	test("pretty-prints JSON output that has no body envelope", () => {
		expect(formatShellOutput('{"status":"ok","count":2}')).toEqual({
			language: "json",
			text: '{\n  "status": "ok",\n  "count": 2\n}',
		});
	});
});

describe("ConversationTraceEventRow shell calls", () => {
	test("renders an associated Claude skill payload inside its Skill row", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "skill-1",
					input: {
						args: "model pricing rate card verification",
						skill: "claude-api",
					},
					kind: "tool",
					result: undefined,
					skillContent: {
						baseDirectory: "/private/tmp/bundled-skills/claude-api",
						content: "# Building with the Claude API\n\nUse the official SDK.",
					},
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Skill",
				}}
			/>,
		);

		expect(markup).toContain("data-trace-skill-details");
		expect(markup).toContain("claude-api");
		expect(markup).toContain("model pricing rate card verification");
		expect(markup).toContain("/private/tmp/bundled-skills/claude-api");
		expect(markup).toContain("# Building with the Claude API");
		expect(markup).not.toContain(">Input<");
		expect(markup).not.toContain(">Output<");
		expect(markup).not.toContain("No result recorded for this call");
	});

	test("lets the row width truncate the full reasoning preview", () => {
		const preview = [
			"The first line stays below the node.",
			"The second line remains available.",
			"The third line remains available.",
			"The fourth line is clamped.",
		].join("\n");
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "reasoning-preview-1",
					kind: "reasoning",
					text: preview,
					timestamp: "2026-08-14T12:00:00.000Z",
				}}
			/>,
		);
		const headerStart = markup.indexOf("data-trace-row-header");
		const headerEnd = markup.indexOf("</div>", headerStart);
		const normalizedPreview = preview.replace(/\s+/gu, " ");

		expect(markup).toContain("data-trace-collapsed-preview");
		expect(markup.indexOf(normalizedPreview)).toBeGreaterThan(headerEnd);
		expect(markup).toContain("line-clamp-3");
		expect(markup).not.toContain("flex-1 truncate font-sans");
		expect(markup).toContain("data-trace-content-disclosure");
		expect(markup).toContain("data-trace-prose-motion");
		expect(markup).toContain("data-trace-expanded-content");
	});

	test("omits disclosure when a prose preview fits within three lines", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "reasoning-preview-short",
					kind: "reasoning",
					text: "A short reasoning preview.",
					timestamp: "2026-08-14T12:00:00.000Z",
				}}
			/>,
		);

		expect(markup).toContain("data-trace-collapsed-preview");
		expect(markup).not.toContain("data-trace-content-disclosure");
		expect(markup).not.toContain("data-trace-content-disclosure-icon");
	});

	test("lets expanded reasoning use the same available row width", () => {
		const source = readFileSync(
			new URL("./conversation-trace-event-row.tsx", import.meta.url),
			"utf8",
		);

		expect(source).not.toContain("max-w-[80ch]");
	});

	test("reduces a collapsed Bash call to one compact command tag", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "bash-1",
					input: {
						command: "bun test ./src/trace.test.ts",
						description: "Run the focused trace test",
					},
					kind: "tool",
					result: { content: "1 pass", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Bash",
				}}
			/>,
		);

		expect(markup).toContain("data-trace-shell-command-tag");
		expect(markup).toContain("bun test ./src/trace.test.ts");
		expect(markup).not.toContain("Run the focused trace test");
		expect(markup).not.toContain("&quot;command&quot;");
		expect(markup).not.toContain(">Ran<");
		expect(markup).toContain("data-trace-details-motion");
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).toContain('inert=""');
		expect(markup).toContain("h-5");
		expect(markup).toContain("items-center");
		expect(markup).toContain("inline-flex h-5 items-center gap-1");
		expect(markup).toContain("rounded-[5px]");
		expect(markup).toContain("pl-1.5");
		expect(markup).not.toContain("pl-0.5");
		expect(markup).toContain("pr-1.5");
		expect(markup).toContain("dashboardy-mono");
		expect(markup).toContain(
			'<code class="min-w-0 truncate whitespace-pre font-mono font-normal tracking-normal [font-variant-ligatures:none]"',
		);
		expect(markup).toContain("data-trace-shell-command-preview");
		expect(
			markup.indexOf("data-trace-content-disclosure-icon"),
		).toBeGreaterThan(markup.indexOf("data-trace-shell-command-preview"));
		expect(markup).toContain("text-[0.75rem]/4");
		expect(markup).toContain("select-none");
		expect(markup.match(/data-trace-hugeicon/g)).toHaveLength(1);
		expect(markup).toContain('data-trace-tag-context="terminal"');
	});

	test("renders generic tool input and output with the shared code cards", () => {
		const markup = renderToStaticMarkup(
			<ToolCallBody
				input={{ query: "session failures" }}
				result={{ content: '{"matches":2}', isError: false }}
				toolName="WebSearch"
			/>,
		);

		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(2);
		expect(markup).toContain(">Input<");
		expect(markup).toContain(">Output<");
		expect(markup).toContain("matches");
		expect(markup).not.toContain("data-trace-code-header-icon");
	});

	test("does not infer diff colors from ordinary Bash output", () => {
		const markup = renderToStaticMarkup(
			<ShellToolCallBody
				command="printf status"
				result={{
					content: "- warning from stderr\n+ recovery message",
					isError: false,
				}}
			/>,
		);

		expect(markup).not.toContain('data-trace-code-line-kind="deletion"');
		expect(markup).not.toContain('data-trace-code-line-kind="addition"');
	});

	test("renders Claude Write as one file diff with line totals", () => {
		const markup = renderToStaticMarkup(
			<ToolCallBody
				input={{
					content:
						"export const first = 1;\nexport const second = 2;\nexport const third = 3;",
					file_path: "/workspace/src/generated.ts",
				}}
				result={{ content: "File written successfully", isError: false }}
				toolName="Write"
			/>,
		);

		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(1);
		expect(markup).toContain(">generated.ts<");
		expect(markup).not.toContain(">Input<");
		expect(markup).not.toContain(">Output<");
		expect(markup).not.toContain("File written successfully");
		expect(markup).toContain('data-trace-code-additions="3"');
		expect(markup).toContain('data-trace-code-deletions="0"');
		expect(markup).toContain(">+3<");
		expect(markup).toContain(">−0<");
		expect(markup.match(/data-trace-code-line-kind="addition"/g)).toHaveLength(
			3,
		);
	});

	test("keeps only the filename tag in a collapsed Write row", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "write-preview-1",
					input: {
						content: "export const answer = 42;",
						file_path: "/workspace/src/generated.ts",
					},
					kind: "tool",
					result: { content: "File written successfully", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Write",
				}}
			/>,
		);

		expect(markup).toContain(">generated.ts<");
		expect(markup).not.toContain("data-trace-preview");
	});

	test("keeps only the filename tag in a collapsed Edit row", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "edit-preview-1",
					input: {
						file_path: "/workspace/src/generated.ts",
						new_string: "export const answer = 42;",
						old_string: "export const answer = 41;",
					},
					kind: "tool",
					result: { content: "File updated successfully", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Edit",
				}}
			/>,
		);

		expect(markup).toContain(">generated.ts<");
		expect(markup).not.toContain("data-trace-preview");
	});

	test("renders Claude Edit old and new strings as one file diff", () => {
		const markup = renderToStaticMarkup(
			<ToolCallBody
				input={{
					file_path:
						"/workspace/.context/plans/token-class-accuracy-finding.md",
					new_string:
						"# Corrected finding\n\n> Updated context\n> with another detail.",
					old_string: "# Original finding",
					replace_all: false,
				}}
				result={{ content: "The file was updated.", isError: false }}
				toolName="Edit"
			/>,
		);

		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(1);
		expect(markup).toContain(">token-class-accuracy-finding.md<");
		expect(markup).toContain("Original finding");
		expect(markup).toContain("Corrected finding");
		expect(markup).not.toContain(">Input<");
		expect(markup).not.toContain(">Output<");
		expect(markup).not.toContain("The file was updated.");
		expect(markup).not.toContain("replace_all");
		expect(markup).toContain('data-trace-code-additions="4"');
		expect(markup).toContain('data-trace-code-deletions="1"');
		expect(markup.match(/data-trace-code-line-kind="deletion"/g)).toHaveLength(
			1,
		);
		expect(markup.match(/data-trace-code-line-kind="addition"/g)).toHaveLength(
			4,
		);
	});

	test("renders orphan results with the shared code card", () => {
		const markup = renderToStaticMarkup(
			<ToolResultBody result={{ content: "orphan output", isError: false }} />,
		);

		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(1);
		expect(markup).toContain(">Output<");
		expect(markup).toContain("orphan output");
	});

	test("uses the TypeScript Hugeicon and brand color for TypeScript files", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "read-ts-1",
					input: { file_path: "/workspace/src/session-turns.ts" },
					kind: "tool",
					result: { content: "file contents", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Read",
				}}
			/>,
		);

		expect(markup).toContain("session-turns.ts");
		expect(markup).toContain('data-trace-tag-context="typescript"');
		expect(markup).toContain("text-[#3178c6]");
		expect(markup).not.toContain("data-trace-preview");
	});

	test("uses the Markdown Hugeicon for Markdown file tags", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "write-markdown-1",
					input: {
						content: "# Release notes",
						file_path: "/workspace/CHANGELOG.md",
					},
					kind: "tool",
					result: { content: "File written successfully", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Write",
				}}
			/>,
		);

		expect(markup).toContain("CHANGELOG.md");
		expect(markup).toContain('data-trace-tag-context="markdown"');
		expect(markup).toContain('data-trace-code-header-icon="markdown"');
	});

	test("separates inline file disclosure from the leading tool icon", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "read-disclosure-1",
					input: { file_path: "/workspace/src/session-turns.ts" },
					kind: "tool",
					result: { content: "file contents", isError: false },
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Read",
				}}
			/>,
		);

		expect(markup).toContain("data-trace-content-disclosure");
		expect(markup).toContain("data-trace-content-disclosure-icon");
		expect(markup).toContain('data-trace-tool-label-group="true"');
		expect(markup).toContain("items-center gap-1");
		expect(markup).toContain("items-center gap-0 text-left");
		expect(markup).toContain("pointer-events-none -ml-0.5 size-4");
		expect(markup).toContain("transition-transform duration-150");
		expect(markup).toContain("data-trace-details-motion");
		expect(markup).toContain("data-trace-expanded-content");
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).toContain(
			"oklch(from var(--constellation-tree-secondary, color(display-p3 0 0 0 / 60.8%)) calc(l + 0.16) c h)",
		);
		expect(markup).toContain('fill="currentColor"');
		expect(markup).toContain(
			"M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802",
		);
		expect(markup).not.toContain("data-trace-collapsed-preview");
		expect(markup).toContain('aria-expanded="false"');
		expect(markup).not.toContain('data-trace-disclosure-symbol="chevron"');
		expect(
			markup.indexOf("data-trace-content-disclosure-icon"),
		).toBeGreaterThan(markup.indexOf(">Read<"));
		expect(
			markup.indexOf("data-trace-content-disclosure-icon"),
		).toBeGreaterThan(markup.indexOf("session-turns.ts"));
	});

	test("renders Claude Read as one named file card with one line-number gutter", () => {
		const markup = renderToStaticMarkup(
			<ToolCallBody
				input={{ file_path: "/workspace/src/session-turns.ts" }}
				result={{
					content:
						"     1→export const first = 1;\n     2→export const second = 2;",
					isError: false,
				}}
				toolName="Read"
			/>,
		);

		expect(markup).toContain("export");
		expect(markup).toContain(">session-turns.ts<");
		expect(markup).toContain('data-trace-code-header-icon="typescript"');
		expect(markup.indexOf("data-trace-code-header-icon")).toBeLessThan(
			markup.indexOf("data-trace-code-file-label"),
		);
		expect(markup).not.toContain(">Input<");
		expect(markup).not.toContain(">Output<");
		expect(markup).not.toContain("1→");
		expect(markup).not.toContain("2→");
		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(1);
		expect(markup.match(/data-trace-code-line=/g)).toHaveLength(2);
	});

	test("uses the delegated model glyph in both the Opaline node and tag", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "agent-1",
					input: {
						description: "Review the trace",
						model: "opus",
						subagent_type: "general-purpose",
					},
					kind: "tool",
					result: undefined,
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Agent",
				}}
			/>,
		);

		expect(markup).toContain(">Delegated<");
		expect(markup).toContain('data-trace-icon-tone="claude"');
		expect(markup).toContain('data-trace-tag-context="delegated-model"');
		expect(markup.match(/viewBox="0 0 1200 1200"/g)).toHaveLength(2);
	});

	test("normalizes a Codex exec command to the same collapsed tag", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "exec-1",
					input: { cmd: "rg --files apps/web/src" },
					kind: "tool",
					result: undefined,
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "exec_command",
				}}
			/>,
		);

		expect(markup).toContain("data-trace-shell-command-tag");
		expect(markup).toContain("rg --files apps/web/src");
		expect(markup).not.toContain("&quot;cmd&quot;");
	});

	test("renders the expanded input and output as two Interfere code cards", () => {
		const markup = renderToStaticMarkup(
			<ShellToolCallBody
				command={'printf "first\\nsecond\\n"'}
				result={{ content: "first\nsecond", isError: false }}
			/>,
		);

		expect(markup).toContain("data-trace-shell-command-details");
		expect(markup.match(/data-trace-code-block=/g)).toHaveLength(2);
		expect(markup.match(/data-trace-code-block-header=/g)).toHaveLength(2);
		expect(markup).toContain(">Input<");
		expect(markup).toContain(">Output<");
		expect(markup).toContain("printf");
		expect(markup).toContain("first");
		expect(markup).toContain("second");
		expect(markup.match(/data-trace-code-line-numbers="true"/g)).toHaveLength(
			2,
		);
	});

	test("unwraps body envelopes before rendering numbered output", () => {
		const markup = renderToStaticMarkup(
			<ShellToolCallBody
				command="gh pr view --json body,state"
				result={{
					content: JSON.stringify({
						body: "## Summary\n- all checks passed",
						state: "OPEN",
					}),
					isError: false,
				}}
			/>,
		);

		expect(markup).toContain("## Summary");
		expect(markup).toContain("all checks passed");
		expect(markup).not.toContain("&quot;body&quot;");
		expect(markup).not.toContain("headRefName");
		expect(markup.match(/data-trace-code-line=/g)).toHaveLength(3);
		expect(markup).not.toContain('data-trace-code-line-kind="deletion"');
	});
});
