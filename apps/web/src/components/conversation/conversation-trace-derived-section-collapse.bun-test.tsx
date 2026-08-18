import { afterAll, beforeAll, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { TraceEvent, TraceItem } from "./conversation-trace";
import type { ConversationTraceDerivedSection } from "./conversation-trace-sections";

type JSDOMInstance = {
	window: Window & typeof globalThis;
};

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
	JSDOM: new (
		markup: string,
		options: { pretendToBeVisual: boolean; url: string },
	) => JSDOMInstance;
};

const DOM_GLOBAL_KEYS = [
	"document",
	"Element",
	"Event",
	"getComputedStyle",
	"HTMLElement",
	"IS_REACT_ACT_ENVIRONMENT",
	"MouseEvent",
	"MutationObserver",
	"navigator",
	"Node",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"window",
] as const;

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
let dom: JSDOMInstance;
let act: typeof import("react").act;
let createElement: typeof import("react").createElement;
let createRoot: typeof import("react-dom/client").createRoot;
let ConversationTraceDerivedSectionRow: ComponentType<{
	agentLabel?: string;
	agentModel?: string;
	allEvents: readonly TraceEvent[];
	continuesAfter: boolean;
	isFirst: boolean;
	modelDisclosureId?: string;
	planMode: boolean;
	section: ConversationTraceDerivedSection;
}>;
let TraceExpansionStoreProvider: ComponentType<{
	children: ReactNode;
	store: ReturnType<
		typeof import("./expandable-trace-row").createTraceExpansionStore
	>;
}>;
let createTraceExpansionStore: typeof import("./expandable-trace-row").createTraceExpansionStore;
let deriveConversationTraceSections: typeof import("./conversation-trace-sections").deriveConversationTraceSections;
let splitAgentSectionByEstimatedHeight: typeof import("@/features/sessions/components/session-transcript-section-budget").splitAgentSectionByEstimatedHeight;

beforeAll(async () => {
	dom = new JSDOM("<!doctype html><html><body></body></html>", {
		pretendToBeVisual: true,
		url: "http://localhost:4011/dev/session",
	});

	for (const key of DOM_GLOBAL_KEYS) {
		originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
	}

	Object.assign(globalThis, {
		document: dom.window.document,
		Element: dom.window.Element,
		Event: dom.window.Event,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
		MouseEvent: dom.window.MouseEvent,
		MutationObserver: dom.window.MutationObserver,
		navigator: dom.window.navigator,
		Node: dom.window.Node,
		requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
		cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
		window: dom.window,
	});
	Object.assign(dom.window, { IS_REACT_ACT_ENVIRONMENT: true });

	({ act, createElement } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ ConversationTraceDerivedSectionRow } = await import(
		"./ConversationTrace"
	));
	({ createTraceExpansionStore, TraceExpansionStoreProvider } = await import(
		"./expandable-trace-row"
	));
	({ deriveConversationTraceSections } = await import(
		"./conversation-trace-sections"
	));
	({ splitAgentSectionByEstimatedHeight } = await import(
		"@/features/sessions/components/session-transcript-section-budget"
	));
});

afterAll(() => {
	dom.window.close();
	for (const key of DOM_GLOBAL_KEYS) {
		const descriptor = originalGlobals.get(key);
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			Reflect.deleteProperty(globalThis, key);
		}
	}
});

test("the model disclosure collapses every budget-split continuation chunk", async () => {
	const events: TraceEvent[] = ["first", "second", "third"].map(
		(label, index) => ({
			content: `${label} chunk`,
			id: `message-${index}`,
			kind: "message",
			text: `${label} chunk`,
			timestamp: `2026-08-18T10:00:0${index}.000Z`,
		}),
	);
	const item: TraceItem = {
		events,
		executionMode: "unknown",
		id: "agent-1",
		kind: "agent",
		timestamp: "2026-08-18T10:00:00.000Z",
	};
	const section = deriveConversationTraceSections({ items: [item] })
		.sections[0];
	assert(section?.kind === "agent");
	const chunks = splitAgentSectionByEstimatedHeight(section, 60);
	expect(chunks).toHaveLength(3);

	const mountPoint = document.createElement("div");
	document.body.append(mountPoint);
	let root!: Root;
	await act(async () => {
		root = createRoot(mountPoint);
		root.render(
			createElement(TraceExpansionStoreProvider, {
				children: chunks.map((chunk, index) =>
					createElement(ConversationTraceDerivedSectionRow, {
						agentLabel: "Claude Fable 5",
						agentModel: "claude-fable-5",
						allEvents: events,
						continuesAfter: index < chunks.length - 1,
						isFirst: index === 0,
						key: chunk.section.key,
						modelDisclosureId: "turn-1",
						planMode: false,
						section: chunk.section,
					}),
				),
				store: createTraceExpansionStore(),
			}),
		);
	});

	const trigger = mountPoint.querySelector<HTMLButtonElement>(
		'[data-transcript-model-header-source="row"] button',
	);
	assert(trigger);
	expect(mountPoint.textContent).toContain("third chunk");

	await act(async () => trigger.click());

	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	expect(mountPoint.textContent).not.toContain("first chunk");
	expect(mountPoint.textContent).not.toContain("second chunk");
	expect(mountPoint.textContent).not.toContain("third chunk");

	await act(async () => trigger.click());

	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	expect(mountPoint.textContent).toContain("first chunk");
	expect(mountPoint.textContent).toContain("second chunk");
	expect(mountPoint.textContent).toContain("third chunk");

	await act(async () => root.unmount());
	mountPoint.remove();
});
