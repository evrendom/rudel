import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TraceBrainIcon } from "./conversation-trace-hugeicons";
import {
	ModelTraceIcon,
	TraceDisclosureIcon,
	UserTraceAvatar,
} from "./conversation-trace-icons";

function getSymbolClassTokens(markup: string, symbol: "chevron" | "icon") {
	const element = markup.match(
		new RegExp(`<[^>]*data-trace-disclosure-symbol="${symbol}"[^>]*>`),
	);
	expect(element).not.toBeNull();
	const className = element?.[0].match(/class="([^"]*)"/)?.[1] ?? "";

	return className.split(" ");
}

describe("TraceDisclosureIcon", () => {
	test("keeps the normal icon visible until an expanded row is hovered", () => {
		const markup = renderToStaticMarkup(
			<TraceDisclosureIcon
				expanded
				expandable
				icon={TraceBrainIcon}
				toolIcon="sparkle"
				tone="violet"
			/>,
		);
		const iconClasses = getSymbolClassTokens(markup, "icon");
		const chevronClasses = getSymbolClassTokens(markup, "chevron");

		expect(iconClasses).not.toContain("opacity-0");
		expect(iconClasses).toContain("group-hover:opacity-0");
		expect(iconClasses).toContain("group-focus-visible:opacity-0");
		expect(chevronClasses).toContain("opacity-0");
		expect(chevronClasses).toContain("group-hover:opacity-90");
		expect(chevronClasses).toContain("group-focus-visible:opacity-90");
		expect(chevronClasses).not.toContain("-rotate-90");
		expect(markup).toContain("data-trace-icon");
		expect(markup).toContain('data-trace-icon-tone="violet"');
		expect(markup).toContain('data-trace-tool-icon="sparkle"');
		expect(markup).toContain("size-3.5");
		expect(markup).toContain("data-trace-hugeicon");
	});

	test("shows the rotated collapsed arrow only on hover or focus", () => {
		const markup = renderToStaticMarkup(
			<TraceDisclosureIcon expanded={false} expandable icon={TraceBrainIcon} />,
		);
		const iconClasses = getSymbolClassTokens(markup, "icon");
		const chevronClasses = getSymbolClassTokens(markup, "chevron");

		expect(iconClasses).not.toContain("opacity-0");
		expect(iconClasses).toContain("group-hover:opacity-0");
		expect(chevronClasses).toContain("opacity-0");
		expect(chevronClasses).toContain("group-hover:opacity-90");
		expect(chevronClasses).toContain("-rotate-90");
	});
});

describe("ModelTraceIcon", () => {
	test("keeps Claude and ChatGPT glyphs in their brand tones", () => {
		const claudeMarkup = renderToStaticMarkup(
			<ModelTraceIcon
				expanded={false}
				expandable={false}
				model="claude-sonnet-4"
			/>,
		);
		const chatGptMarkup = renderToStaticMarkup(
			<ModelTraceIcon expanded={false} expandable={false} model="gpt-5" />,
		);

		expect(claudeMarkup).toContain('data-trace-icon-tone="claude"');
		expect(claudeMarkup).toContain("text-[#CC7D5E]");
		expect(chatGptMarkup).toContain('data-trace-icon-tone="openai"');
		expect(chatGptMarkup).toContain("text-[#111111]");
	});
});

describe("UserTraceAvatar", () => {
	test("uses the shared unclipped icon shadow without an outline", () => {
		const markup = renderToStaticMarkup(
			<UserTraceAvatar
				expanded={false}
				expandable={false}
				imageUrl="/avatar.webp"
			/>,
		);

		expect(markup).toContain("data-user-trace-avatar-shell");
		expect(markup).toContain("drop-shadow-[0_0_0.75px_rgb(0_0_0_/_14%)]");
		expect(markup).not.toContain("outline-1");
		expect(markup).toContain("size-full rounded-full object-cover");
	});
});
