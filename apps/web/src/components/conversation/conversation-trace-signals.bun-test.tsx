import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationTrace } from "./ConversationTrace";

const timestamp = "2026-08-18T10:00:00.000Z";

describe("ConversationTrace language signals", () => {
	test("highlights direct user previews", () => {
		const markup = renderToStaticMarkup(
			<ConversationTrace
				agentLabel="Agent"
				agentModel="claude-fable-5"
				items={[
					{
						content: "Is this correct?",
						id: "user-signal",
						kind: "user",
						timestamp,
					},
				]}
				userImageUrl={undefined}
				userLabel="Member"
			/>,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).toContain("bg-[color(display-p3_0.122_0.463_1_/_0.219)]");
	});

	test("highlights model-authored summary prose", () => {
		const markup = renderToStaticMarkup(
			<ConversationTrace
				agentLabel="Agent"
				agentModel="claude-fable-5"
				items={[
					{
						id: "summary-signal",
						kind: "summary",
						text: "An elegant solution.",
						timestamp: undefined,
					},
				]}
				userImageUrl={undefined}
				userLabel="Member"
			/>,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).toContain("elegant");
	});
});
