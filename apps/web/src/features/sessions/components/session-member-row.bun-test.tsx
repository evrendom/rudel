import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationTraceTreeConnectorStyleProvider } from "@/components/conversation/ConversationTrace";
import { SessionMemberRow } from "./session-member-row";

describe("SessionMemberRow trace rail", () => {
	test("renders the prompt below a reasoning-style disclosure without measured height", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<SessionMemberRow
					active
					headingId="member-heading"
					items={[
						{
							content:
								"A multiline member prompt that extends below its header.",
							id: "member-message",
							kind: "user",
							timestamp: "2026-08-14T09:00:00.000Z",
						},
					]}
					speakerLayout="trace-tree"
					startsTrace
					userImageUrl={undefined}
					userLabel="Member"
				/>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain('aria-expanded="false"');
		expect(markup).toContain('data-trace-start-node="true"');
		expect(markup).toContain('data-active-member="true"');
		expect(markup).toContain('data-session-turn-speaker="member"');
		expect(markup).toContain("data-trace-content-disclosure-icon");
		expect(markup).not.toContain('data-trace-disclosure-symbol="chevron"');
		expect(markup).toContain("data-trace-preview");
		expect(markup).toContain("pl-[1.8125rem]");
		expect(markup).not.toContain("pl-[3.25rem]");
		expect(markup.indexOf("data-trace-content-disclosure")).toBeLessThan(
			markup.indexOf("data-trace-preview"),
		);
		expect(markup).not.toContain("data-trace-tree-motion-panel");
		expect(markup).toContain("data-trace-tree-subtree-rails");
		expect(markup).not.toContain('hidden=""');
		expect(markup).toContain(
			"A multiline member prompt that extends below its header.",
		);
		expect(markup).not.toContain("max-h-24");
		expect(markup).not.toContain(">More<");
		expect(markup).not.toContain(">Less<");

		const source = readFileSync(
			new URL("./session-member-row.tsx", import.meta.url),
			"utf8",
		);
		expect(source).not.toContain("ResizeObserver");
		expect(source).not.toContain("scrollHeight");
		expect(source).not.toContain("ConversationTraceCollapsiblePanel");
		expect(source).not.toContain("@base-ui/react/collapsible");
	});

	test("renders the sticky-owner connector geometry and measured height", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<SessionMemberRow
					active={false}
					continues={false}
					headerHeight={56}
					headingId="terminal-member-heading"
					items={[]}
					speakerLayout="trace-tree"
					startsTrace={false}
					stickyHeader={false}
					terminal
					userImageUrl={undefined}
					userLabel="Member"
				/>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain('data-transcript-member-terminal="true"');
		expect(markup).not.toContain('data-trace-tree-continues="true"');
		expect(markup).toContain('height="56"');
		expect(markup).toContain("min-height:56px");
	});
});
