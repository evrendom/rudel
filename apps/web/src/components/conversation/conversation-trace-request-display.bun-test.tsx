import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getTraceCallDisplayConfig } from "./conversation-trace-call-display";
import { AgentTraceRequestDisplay } from "./conversation-trace-tree";

describe("AgentTraceRequestDisplay", () => {
	test("uses Interfere metadata rhythm instead of token pills", () => {
		const markup = renderToStaticMarkup(
			<AgentTraceRequestDisplay
				agentModel="claude-sonnet-4"
				config={getTraceCallDisplayConfig("request")}
				expanded
				index={1}
				presentation="header"
				previousInputTotal={undefined}
				usage={{
					at: "2026-08-13T12:00:00.000Z",
					cacheCreationInputTokens: 100,
					cacheReadInputTokens: 750,
					inputTokens: 150,
					model: "claude-sonnet-4",
					outputTokens: 80,
				}}
			/>,
		);

		expect(markup).toContain("Request 1");
		expect(markup).toContain("IN 1.0k tok");
		expect(markup).toContain("75% cached");
		expect(markup).toContain("OUT 80 tok");
		expect(markup.match(/data-trace-request-separator/g)).toHaveLength(3);
		expect(markup.match(/data-trace-request-metadata="true"/g)).toHaveLength(3);
		expect(markup).toContain("tabular-nums");
		expect(markup).toContain("gap-1.5");
		expect(markup).not.toContain("rounded-full");
		expect(markup).not.toContain("font-medium");
		expect(markup).not.toContain("tracking-[-0.01em]");
		expect(markup).not.toContain("px-2");
		expect(markup).not.toContain("py-0.5");
	});
});
