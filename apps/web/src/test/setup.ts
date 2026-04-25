import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

class ResizeObserverMock implements ResizeObserver {
	observe() {}

	unobserve() {}

	disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

afterEach(() => {
	cleanup();
});
