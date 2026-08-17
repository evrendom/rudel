import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock, InlineCode } from "./CodeBlock";

describe("CodeBlock", () => {
	test("uses the Interfere compact code-card structure", () => {
		const markup = renderToStaticMarkup(
			<CodeBlock
				code={
					'const token = sign(userId);\n- const baseUrl = "https://staging.example.com";\n+ const baseUrl = "https://example.com/reset-password";'
				}
				filename="auth/reset.ts"
				language="typescript"
				showLineNumbers
			/>,
		);

		expect(markup).toContain("data-trace-code-block");
		expect(markup).toContain("data-trace-code-block-header");
		expect(markup).toContain("data-trace-code-block-content");
		expect(markup).toContain('data-trace-code-highlight-state="plain"');
		expect(markup).toContain('data-trace-code-line-numbers="true"');
		expect(markup).toContain("trace-code-block relative rounded-lg");
		expect(markup).not.toContain("overflow-clip");
		// The filename bar stays fixed within the code card but travels with the
		// complete card during normal conversation scrolling.
		expect(markup).toContain("relative z-20");
		expect(markup).not.toContain("sticky z-20");
		expect(markup).not.toContain("bg-[color:var(--trace-code-surface)]");
		expect(markup).not.toContain("data-trace-code-header-stuck");
		expect(markup).not.toContain("data-trace-code-scroll-range");
		expect(markup).toContain('tabindex="0"');
		expect(markup).toContain("Scrollable code for auth/reset.ts");
		expect(markup).toContain("rounded-lg");
		expect(markup).toContain("h-8");
		expect(markup).toContain("border-b-[0.5px]");
		expect(markup).toContain("auth/reset.ts");
		expect(markup).not.toContain(">Open<");
		expect(markup).not.toContain("data-trace-code-open-label");
		expect(markup).toContain('data-trace-code-header-icon="typescript"');
		expect(markup).toContain("text-[#3178c6]");
		expect(markup.indexOf("data-trace-code-header-icon")).toBeLessThan(
			markup.indexOf("data-trace-code-file-label"),
		);
		expect(markup).not.toContain("data-trace-code-github-icon");
		expect(markup).toContain("data-trace-hugeicon");
		expect(markup).toContain("trace-code-block");
		expect(markup).toContain("border-[color:var(--trace-code-border)]");
		expect(markup).toContain("padding:6px 8px");
		expect(markup).toContain("font-size:12px");
		expect(markup).toContain("line-height:16px");
		expect(markup).toContain("font-family:&quot;Geist Mono&quot;");
		expect(markup).not.toContain("BerkeleyMono");
		expect(markup).toContain("white-space:pre-wrap");
		expect(markup).toContain("overflow-wrap:anywhere");
		expect(markup).toContain("padding-left:38px");
		expect(markup).toContain("text-indent:-38px");
		expect(markup).not.toContain("last-child]:truncate");
		expect(markup.match(/data-trace-code-line=/g)).toHaveLength(3);
		expect(markup).not.toContain('data-trace-code-line-kind="deletion"');
		expect(markup).not.toContain('data-trace-code-line-kind="addition"');
		expect(markup).toContain("rounded-[3px]");
		expect(markup).toContain("min-width:16px");
		expect(markup).toContain("margin-right:16px");
		expect(markup).not.toContain("rounded-[1rem]");
		expect(markup).not.toContain("bg-[#0f172a]");
		expect(markup).not.toContain("padding:1.125rem");
		expect(markup).not.toContain(">Code<");
	});

	test("never synchronously highlights while rendering a code block", () => {
		const source = readFileSync(
			new URL("./CodeBlock.tsx", import.meta.url),
			"utf8",
		);
		const cacheSource = readFileSync(
			new URL("./code-highlight-cache.ts", import.meta.url),
			"utf8",
		);

		expect(source).not.toContain("SyntaxHighlighter");
		expect(source).not.toContain("codeToHtml");
		expect(source).not.toContain("codeToTokens");
		expect(cacheSource).toContain("new Worker(");
		expect(cacheSource).toContain("CODE_HIGHLIGHT_CACHE_LIMIT = 64");
	});

	test("applies diff colors only when the content is explicitly a diff", () => {
		const markup = renderToStaticMarkup(
			<CodeBlock
				code={'- const state = "old";\n+ const state = "new";'}
				filename="state.patch"
				language="diff"
				showLineNumbers
			/>,
		);

		expect(markup).toContain('data-trace-code-line-kind="deletion"');
		expect(markup).toContain('data-trace-code-line-kind="addition"');
	});

	test("uses the generic code glyph for other named source files", () => {
		const markup = renderToStaticMarkup(
			<CodeBlock
				code={'print("hello")'}
				filename="scripts/check.py"
				language="python"
			/>,
		);

		expect(markup).toContain('data-trace-code-header-icon="code"');
		expect(markup).toContain("data-trace-hugeicon");
	});

	test("keeps Prism Markdown table tokens inline", () => {
		const css = readFileSync(
			new URL("./code-block.css", import.meta.url),
			"utf8",
		);

		expect(css).toContain(".trace-code-block .token.table");
		expect(css).toContain("display: inline");
	});

	test("gates the inner code scroller behind explicit focus", () => {
		const css = readFileSync(
			new URL("./code-block.css", import.meta.url),
			"utf8",
		);

		// Split borders let the filename row look like the card top.
		expect(css).toContain("border-top: 0.5px solid var(--trace-code-outline)");
		expect(css).toContain(
			"border-bottom: 0.5px solid var(--trace-code-outline)",
		);
		expect(css).toContain("[data-trace-code-block-header]::before");
		expect(css).toContain("bottom: calc(100% + 0.5px)");
		expect(css).toContain("height: var(--trace-code-sticky-gap, 4px)");
		expect(css).toContain(
			"box-shadow: 0 -2px 0 2px var(--trace-code-sticky-surface)",
		);
		// The content box is capped, but page scrolling remains the default.
		expect(css).toContain("max-height: var(--trace-code-max-height, 24rem)");
		expect(css).toContain("overflow-y: hidden");
		expect(css).toContain("overscroll-behavior-y: auto");
		expect(css).toContain("[data-trace-code-block-content]:focus");
		expect(css).toContain("overflow-y: auto");
		expect(css).toContain("overscroll-behavior-y: contain");
		// No artificial outer range or sticky card may lengthen page scrolling.
		expect(css).not.toContain("data-trace-code-scroll-range");
		expect(css).not.toContain("--trace-code-frame-height");
		expect(css).not.toContain("--trace-code-release-hold");
		expect(css).not.toContain("--trace-code-sibling-clearance");
		expect(css).not.toContain("--trace-code-scroll-range");
		expect(css).not.toContain("--trace-code-pin-offset");
		expect(css).not.toContain("transform: translateY");
		// No runtime stuck state and no clipping root.
		expect(css).not.toContain("data-trace-code-header-stuck");
		expect(css).not.toContain("100vh");
		expect(css).not.toContain("dvh");
		expect(css).not.toContain("overflow-clip-margin");
	});

	test("widens the gutter before line numbers reach three digits", () => {
		const code = Array.from(
			{ length: 151 },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		const markup = renderToStaticMarkup(
			<CodeBlock
				changeSummary={{ additions: 151, deletions: 0 }}
				code={code}
				filename="long-file.ts"
				language="typescript"
				lineChangeKind="addition"
				showLineNumbers
			/>,
		);

		expect(markup).toContain("min-width:24px");
		expect(markup).toContain("width:24px");
		expect(markup).toContain("padding-left:46px");
		expect(markup).toContain("text-indent:-46px");
	});
});

describe("InlineCode", () => {
	test("uses the shared code surface and Geist Mono treatment", () => {
		const markup = renderToStaticMarkup(<InlineCode>session.id</InlineCode>);

		expect(markup).toContain("data-trace-inline-code");
		expect(markup).toContain("trace-inline-code");
		expect(markup).toContain("session.id");
	});
});
