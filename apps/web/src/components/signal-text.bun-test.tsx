import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	clearLanguageSignalScanCache,
	getLanguageSignalScanCacheSize,
	LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY,
	SignalText,
	SignalTextSearchQueryProvider,
	scanLanguageSignalsCached,
} from "./signal-text";

describe("SignalText", () => {
	test("wraps each category and preserves surrounding text", () => {
		const markup = renderToStaticMarkup(
			<SignalText text="Well done, sorry this is shit." />,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).toContain('data-signal="apology"');
		expect(markup).toContain('data-signal="swear"');
		expect(markup).toContain("Well done");
		expect(markup).toContain("sorry");
		expect(markup).toContain("shit");
	});

	test("renders unmatched text without an extra wrapper", () => {
		expect(renderToStaticMarkup(<SignalText text="neutral text" />)).toBe(
			"neutral text",
		);
	});

	test("uses category-colored compact pill treatments", () => {
		const markup = renderToStaticMarkup(
			<SignalText text="fishy shit sorry great" />,
		);

		expect(markup).toContain('data-text="true"');
		expect(markup).toContain("rounded-[8px]");
		expect(markup).toContain("px-[4px]");
		expect(markup).toContain("py-[2px]");
		expect(markup).toContain("text-[13px]");
		expect(markup).toContain("leading-[20px]");
		expect(markup).toContain('data-signal="negative"');
		expect(markup).toContain('data-signal="swear"');
		expect(markup).toContain("bg-[#ffe4e6]");
		expect(markup).toContain("text-[#be123c]");
		expect(markup).toContain('data-signal="apology"');
		expect(markup).toContain("bg-[#fef3c7]");
		expect(markup).toContain("text-[#b45309]");
		expect(markup).toContain('data-signal="positive"');
		expect(markup).toContain("bg-[#dcfce7]");
		expect(markup).toContain("text-[#15803d]");
		expect(markup).toContain("select-none");
	});

	test("keeps the scan cache at its LRU capacity", () => {
		clearLanguageSignalScanCache();
		const oldestMatches = scanLanguageSignalsCached("great cache entry 0");
		for (
			let index = 1;
			index <= LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY;
			index += 1
		) {
			scanLanguageSignalsCached(`great cache entry ${index}`);
		}

		expect(getLanguageSignalScanCacheSize()).toBe(
			LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY,
		);
		expect(scanLanguageSignalsCached("great cache entry 0")).not.toBe(
			oldestMatches,
		);
		expect(getLanguageSignalScanCacheSize()).toBe(
			LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY,
		);
		clearLanguageSignalScanCache();
	});

	test("lets a search match split a signal without nesting marks", () => {
		const markup = renderToStaticMarkup(
			<SignalText searchQuery="rea" text="great" />,
		);
		const searchMark = markup.match(
			/<mark[^>]*data-search-highlight="true"[^>]*>rea<\/mark>/u,
		)?.[0];

		expect(searchMark).toBeDefined();
		expect(searchMark).not.toContain("data-signal");
		expect(markup.match(/data-signal="positive"/gu)).toHaveLength(2);
	});

	test("inherits the transcript search query and keeps search visually dominant", () => {
		const markup = renderToStaticMarkup(
			<SignalTextSearchQueryProvider query="rea">
				<SignalText text="great" />
			</SignalTextSearchQueryProvider>,
		);
		const searchMark = markup.match(
			/<mark[^>]*data-search-highlight="true"[^>]*>rea<\/mark>/u,
		)?.[0];

		expect(searchMark).toBeDefined();
		expect(searchMark).not.toContain("data-signal");
		expect(markup.match(/data-signal="positive"/gu)).toHaveLength(2);
	});
});
