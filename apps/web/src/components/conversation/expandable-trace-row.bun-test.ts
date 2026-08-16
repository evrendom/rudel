import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ExpandableTraceRow expanded body layout", () => {
	test("keeps expanded content below the sticky row masking boundary", () => {
		const rowSource = readFileSync(
			new URL("./expandable-trace-row.tsx", import.meta.url),
			"utf8",
		);
		const treeSource = readFileSync(
			new URL("./conversation-trace-tree.tsx", import.meta.url),
			"utf8",
		);

		expect(rowSource).toContain(
			'const expandedBodyClassName = "pt-1 pr-3 pb-2.5 pl-3"',
		);
		expect(rowSource).toContain('const proseBodyClassName = "px-3 py-1"');
		expect(rowSource).not.toContain('"flex min-h-10 items-center"');
		expect(rowSource).not.toContain('expandedBodyClassName = "-mt-');
		expect(rowSource).not.toContain("pb-2.5 pl-10");
		expect(rowSource).toContain("data-trace-prose-motion");
		expect(rowSource).toContain("data-trace-details-motion");
		expect(rowSource).toContain(
			'"relative h-(--trace-prose-body-height) min-w-0 overflow-clip transition-[height] duration-200',
		);
		expect(rowSource).toContain(
			'"relative h-(--trace-details-body-height) min-w-0 overflow-clip transition-[height] duration-200',
		);
		expect(rowSource).toContain("collapsedProseBodyHeight = 68");
		expect(rowSource).toContain("data-trace-collapsed-preview");
		expect(rowSource).toContain("data-trace-expanded-content");
		expect(treeSource).toContain("data-trace-tree-expanded-surface");
		expect(treeSource).toContain("data-trace-tree-expanded-rails");
		expect(treeSource).toContain("data-trace-tree-motion-panel");
		expect(treeSource).toContain("h-(--collapsible-panel-height)");
		expect(treeSource).toContain("data-ending-style:h-0");
		expect(treeSource).toContain("data-starting-style:h-0");
		expect(treeSource).toContain(
			'<Collapsible.Panel id={panelId} className="transition-none">',
		);
		expect(treeSource).not.toContain(
			'<Collapsible.Panel className="transition-none">',
		);
		expect(treeSource).toContain(
			'className="relative min-w-0 flow-root" data-trace-tree-row-body',
		);
		// Sticky rows must stay fully opaque for their entire height: a partial
		// gradient surface leaves a see-through band where scrolled code peeks
		// out between pinned rows.
		expect(treeSource).not.toContain("transparent 38px");
	});
});
