import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionDetailErrorBoundary } from "./session-detail-view-parts";

describe("SessionDetailErrorBoundary", () => {
	test("keeps a render failure inside the session route with recovery actions", () => {
		const boundary = new SessionDetailErrorBoundary({
			children: null,
			fallbackHref: "/session",
		});
		boundary.state = SessionDetailErrorBoundary.getDerivedStateFromError();

		const markup = renderToStaticMarkup(boundary.render());

		expect(markup).toContain("Unable to render this session");
		expect(markup).toContain("Reload session");
		expect(markup).toContain('href="/session"');
		expect(markup).toContain("Back to sessions");
	});
});
