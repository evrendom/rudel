import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	clearLanguageSignalScanCache,
	getLanguageSignalScanCacheSize,
	LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY,
	SignalText,
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

	test("uses the compact brand pill treatment", () => {
		const markup = renderToStaticMarkup(<SignalText text="great" />);

		expect(markup).toContain('data-text="true"');
		expect(markup).toContain("bg-brand-subtle");
		expect(markup).toContain("text-brand-solid");
		expect(markup).toContain("text-body-sm");
		expect(markup).toContain("rounded-lg");
		expect(markup).toContain("px-1");
		expect(markup).toContain("py-0.5");
		expect(markup).toContain(
			"background:color(display-p3 0.122 0.463 1 / 0.219)",
		);
		expect(markup).toContain(
			"color:color(display-p3 0.251 0.573 0.996 / 0.967)",
		);
		expect(markup).toContain("background-clip:border-box");
		expect(markup).toContain("border-radius:8px");
		expect(markup).toContain("padding:2px 4px");
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
});
