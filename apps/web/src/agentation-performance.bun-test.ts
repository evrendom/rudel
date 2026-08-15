import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { Root } from "react-dom/client";

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
	"HTMLElement",
	"IS_REACT_ACT_ENVIRONMENT",
	"localStorage",
	"MutationObserver",
	"navigator",
	"Node",
	"ShadowRoot",
	"window",
] as const;

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
let dom: JSDOMInstance;
let Agentation: typeof import("agentation").Agentation;
let AnnotationPopupCSS: typeof import("agentation").AnnotationPopupCSS;
let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let createElement: typeof import("react").createElement;
let captureAnimationFrames = false;
const animationFrameCapture: { callback?: FrameRequestCallback } = {};

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
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
		localStorage: dom.window.localStorage,
		MutationObserver: dom.window.MutationObserver,
		navigator: dom.window.navigator,
		Node: dom.window.Node,
		ShadowRoot: dom.window.ShadowRoot,
		window: dom.window,
	});
	Object.assign(dom.window, { IS_REACT_ACT_ENVIRONMENT: true });
	const requestAnimationFrame = dom.window.requestAnimationFrame.bind(
		dom.window,
	);
	dom.window.requestAnimationFrame = (callback) => {
		if (captureAnimationFrames) {
			animationFrameCapture.callback = callback;
			return 1;
		}
		return requestAnimationFrame(callback);
	};

	({ Agentation, AnnotationPopupCSS } = await import("agentation"));
	({ act, createElement } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
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

describe("Agentation hover performance", () => {
	test("coalesces hover work to one frame while page animations are frozen", async () => {
		localStorage.clear();
		captureAnimationFrames = false;
		Reflect.deleteProperty(animationFrameCapture, "callback");
		const mountPoint = document.createElement("div");
		const target = document.createElement("button");
		target.textContent = "Inspect me";
		document.body.append(mountPoint, target);

		let layoutReadCount = 0;
		target.getBoundingClientRect = () => {
			layoutReadCount += 1;
			return new dom.window.DOMRect(0, 0, 100, 40);
		};
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: () => target,
		});

		let root!: Root;
		await act(async () => {
			root = createRoot(mountPoint);
			root.render(createElement(Agentation));
		});

		const startButton = document.querySelector<HTMLElement>(
			'[title="Start feedback mode"]',
		);
		expect(startButton).not.toBeNull();
		assert(startButton);
		await act(async () => {
			startButton.dispatchEvent(
				new dom.window.MouseEvent("click", { bubbles: true }),
			);
		});

		const freezeState = (
			window as typeof window & {
				__agentation_freeze?: { frozen: boolean };
			}
		).__agentation_freeze;
		assert(freezeState);
		freezeState.frozen = true;
		captureAnimationFrames = true;

		for (let index = 0; index < 40; index += 1) {
			target.dispatchEvent(
				new dom.window.MouseEvent("mousemove", {
					bubbles: true,
					clientX: index,
					clientY: index,
				}),
			);
		}

		expect(layoutReadCount).toBe(0);
		expect(animationFrameCapture.callback).toBeTypeOf("function");
		const frame = animationFrameCapture.callback;
		assert(frame);

		await act(async () => {
			frame(16);
		});

		expect(layoutReadCount).toBe(1);

		captureAnimationFrames = false;
		freezeState.frozen = false;
		await act(async () => root.unmount());
		mountPoint.remove();
		target.remove();
	});
});

describe("Agentation note performance", () => {
	test("does not rerender the popup while typing", async () => {
		const mountPoint = document.createElement("div");
		document.body.append(mountPoint);
		const submittedNotes: string[] = [];
		let computedStyleReads = 0;
		const computedStyles = new Proxy(
			{ color: "rgb(255, 255, 255)" },
			{
				ownKeys(target) {
					computedStyleReads += 1;
					return Reflect.ownKeys(target);
				},
			},
		);

		let root!: Root;
		await act(async () => {
			root = createRoot(mountPoint);
			root.render(
				createElement(AnnotationPopupCSS, {
					computedStyles,
					element: "button",
					onCancel: () => {},
					onSubmit: (note: string) => submittedNotes.push(note),
				}),
			);
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 300));
		});

		const textarea = mountPoint.querySelector("textarea");
		expect(textarea).not.toBeNull();
		assert(textarea);
		const setTextareaValue = Object.getOwnPropertyDescriptor(
			dom.window.HTMLTextAreaElement.prototype,
			"value",
		)?.set;
		assert(setTextareaValue);
		const readsBeforeTyping = computedStyleReads;

		await act(async () => {
			for (const value of ["n", "no", "not", "note"]) {
				setTextareaValue.call(textarea, value);
				textarea.dispatchEvent(
					new dom.window.Event("input", { bubbles: true }),
				);
			}
		});

		expect(computedStyleReads).toBe(readsBeforeTyping);
		expect(textarea.value).toBe("note");
		const submitButton = Array.from(mountPoint.querySelectorAll("button")).find(
			(button) => button.textContent === "Add",
		);
		expect(submitButton?.disabled).toBe(false);
		await act(async () => submitButton?.click());
		expect(submittedNotes).toEqual(["note"]);

		await act(async () => root.unmount());
		mountPoint.remove();
	});
});
