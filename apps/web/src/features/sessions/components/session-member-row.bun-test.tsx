import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationTraceTreeConnectorStyleProvider } from "@/components/conversation/ConversationTrace";
import { SessionMemberRow } from "./session-member-row";

describe("SessionMemberRow trace rail", () => {
	test("renders a short prompt in full without a disclosure", () => {
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

		expect(markup).not.toContain("aria-expanded");
		expect(markup).toContain('data-trace-start-node="true"');
		expect(markup).not.toContain('data-trace-tree-rail-segment="incoming"');
		expect(markup).toContain('data-trace-tree-rail-segment="outgoing"');
		expect(markup).toContain('data-active-member="true"');
		expect(markup).toContain('data-session-turn-speaker="member"');
		expect(markup).not.toContain("data-trace-content-disclosure-icon");
		expect(markup).not.toContain('data-trace-disclosure-symbol="chevron"');
		expect(markup).not.toContain("data-trace-preview");
		expect(markup).toContain("pl-[1.8125rem]");
		expect(markup).not.toContain("pl-[3.25rem]");
		expect(markup).not.toContain("data-trace-content-disclosure");
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

	test("keeps a long prompt collapsed behind the shared disclosure", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<SessionMemberRow
					active
					headingId="member-long-heading"
					items={[
						{
							content: `${"Long prompt content. ".repeat(90)} sorry`,
							id: "member-long-message",
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
		expect(markup).toContain("data-trace-content-disclosure-icon");
		expect(markup).toContain("data-trace-preview");
		expect(markup).toContain("data-trace-text-preview-tail");
		expect(markup).toContain('data-signal="apology"');
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

	test("highlights member prose without matching across message boundaries", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<SessionMemberRow
					active
					headingId="member-signal-heading"
					items={[
						{
							content: "You are",
							id: "member-signal-1",
							kind: "user",
							timestamp: "2026-08-18T09:00:00.000Z",
						},
						{
							content: "right. Sorry.",
							id: "member-signal-2",
							kind: "user",
							timestamp: "2026-08-18T09:00:01.000Z",
						},
					]}
					speakerLayout="trace-tree"
					startsTrace
					userImageUrl={undefined}
					userLabel="Member"
				/>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain('data-signal="apology"');
		expect(markup).not.toContain('data-signal="positive"');
	});

	test("does not highlight signals inside member system-instruction blocks", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<SessionMemberRow
					active
					headingId="member-system-signal-heading"
					items={[
						{
							content:
								"Great <system_instruction>Sorry, this is fishy</system_instruction>",
							id: "member-system-signal",
							kind: "user",
							timestamp: "2026-08-18T09:00:00.000Z",
						},
					]}
					speakerLayout="trace-tree"
					startsTrace
					userImageUrl={undefined}
					userLabel="Member"
				/>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).not.toContain('data-signal="apology"');
		expect(markup).not.toContain('data-signal="negative"');
		expect(markup).toContain("Sorry, this is fishy");
	});
});
