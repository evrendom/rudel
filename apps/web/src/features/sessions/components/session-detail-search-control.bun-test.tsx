import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionDetailSearchControl } from "./session-detail-search-control";

describe("SessionDetailSearchControl", () => {
	test("renders the active transcript query owned by its parent", () => {
		const markup = renderToStaticMarkup(
			<SessionDetailSearchControl
				index={new Map()}
				loadState={{ status: "idle" }}
				onCancel={() => undefined}
				onFocus={() => undefined}
				onQueryChange={() => undefined}
				onSelectResult={() => undefined}
				options={[]}
				query="correct"
			/>,
		);

		expect(markup).toContain('value="correct"');
	});
});
