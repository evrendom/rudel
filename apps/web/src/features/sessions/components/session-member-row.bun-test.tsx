import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationTraceTreeConnectorStyleProvider } from "@/components/conversation/ConversationTrace";
import { SessionMemberRow } from "./session-member-row";

describe("SessionMemberRow trace rail", () => {
	test("renders member prompts at natural height without a measured disclosure", () => {
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

		expect(markup).toContain('aria-expanded="true"');
		expect(markup).toContain('data-trace-start-node="true"');
		expect(markup).toContain('data-active-member="true"');
		expect(markup).toContain('data-session-turn-speaker="member"');
		expect(markup).toContain("data-trace-content-disclosure-icon");
		expect(markup).not.toContain('data-trace-disclosure-symbol="chevron"');
		expect(markup).toContain("data-trace-preview");
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
});
