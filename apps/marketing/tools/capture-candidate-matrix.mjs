import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertNonBlank, imageHistogram } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const viewports = [
	{ name: "phone", width: 390, height: 844, mobile: true },
	{ name: "tablet", width: 768, height: 1024, mobile: true },
	{ name: "desktop", width: 1280, height: 800, mobile: false },
	{ name: "wide", width: 1680, height: 1050, mobile: false },
];
const url = process.env.OPALINE_CANDIDATE_URL ?? "http://127.0.0.1:4321/";
const outputDirectory = path.resolve(
	process.env.OPALINE_MATRIX_OUTPUT ?? ".context/gates/g4-fresh/candidate",
);

const metadata = {
	url,
	capturedAt: new Date().toISOString(),
	viewports,
	shots: [],
	sections: {},
	responsiveAudits: {},
};

const shot = async ({ session, viewport, state, scrollY = null, scenario = [], mode = "default", weakHistogram = false }) => {
	const filename = `${viewport.name}-${state}.png`;
	const outputPath = path.join(outputDirectory, filename);
	await session.screenshot(outputPath);
	const histogram = await imageHistogram(outputPath, {
		x: 0,
		y: 0,
		width: viewport.width,
		height: viewport.height,
	});
	const histogramValidation = weakHistogram
		? { minimumQuantizedColors: 2, minimumNonWhitePercent: 0.05 }
		: undefined;
	assertNonBlank(histogram, `${viewport.name}-${state}`, histogramValidation);
	metadata.shots.push({
		viewport: viewport.name,
		state,
		filename,
		scrollY,
		scenario,
		mode,
		histogramValidation: histogramValidation ?? null,
		histogram,
	});
};

const moveTo = async (session, element) => {
	const rect = await session.evaluate(`(() => {
		const element = ${element};
		if (!element) return null;
		const rect = element.getBoundingClientRect();
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	})()`);
	if (!rect) return null;
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
		button: "none",
		buttons: 0,
	});
	return rect;
};

const navbarStates = async (session, viewport) => {
	await session.scrollTo(0);
	await wait(400);
	if (viewport.width < 768) {
		const opened = await session.evaluate(`(() => {
			const button = document.querySelector('button[aria-haspopup="dialog"]');
			if (!button) return false;
			button.click();
			return true;
		})()`);
		if (opened) {
			await wait(250);
			await shot({ session, viewport, state: "mobile-menu-open", scrollY: 0, scenario: ["open mobile menu"] });
		}
		return;
	}
	const byText = (text) => `[...document.querySelectorAll("button,a")].find((node) => node.textContent?.trim() === ${JSON.stringify(text)})`;
	const product = await moveTo(session, byText("Product"));
	if (product) {
		await wait(350);
		await shot({ session, viewport, state: "navbar-product-open", scrollY: 0, scenario: ["hover Product for 350ms"] });
		const item = await moveTo(session, `[...document.querySelectorAll("a")].find((node) => { const rect = node.getBoundingClientRect(); return rect.width > 100 && rect.height > 30 && rect.y > 70; })`);
		if (item) {
			await wait(100);
			await shot({ session, viewport, state: "navbar-item-hover", scrollY: 0, scenario: ["hover first dropdown item"] });
			await session.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: product.x + product.width / 2, y: product.y + product.height / 2 });
			await wait(80);
		}
	}
	const resources = await moveTo(session, byText("Resources"));
	if (resources) {
		await wait(90);
		await shot({ session, viewport, state: "navbar-switch-mid", scrollY: 0, scenario: ["Product to Resources, 90ms"] });
		await wait(260);
		await shot({ session, viewport, state: "navbar-resources-open", scrollY: 0, scenario: ["Resources settled"] });
	}
	for (const type of ["keyDown", "keyUp"]) {
		await session.client.call("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape" });
	}
	await session.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 8, y: Math.min(viewport.height - 8, 500) });
	await wait(260);
};

const dashboardStates = async (session, viewport) => {
	await session.scrollTo(500);
	await wait(500);
	const labels = await session.evaluate(`[...document.querySelectorAll("[data-opaline-use-case]")].map((button) => ({ value: button.dataset.opalineUseCase, label: button.textContent.trim() }))`);
	for (const option of labels) {
		await session.evaluate(`document.querySelector('[data-opaline-use-case=${JSON.stringify(option.value)}]')?.click()`);
		await wait(260);
		await shot({
			session,
			viewport,
			state: `use-case-${option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
			scrollY: 500,
			scenario: [`select ${option.label}`],
		});
	}
	const windows = await session.evaluate(`[...document.querySelectorAll("[data-opaline-claude-window]")].map((element, index) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { index, x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility }; })`);
	metadata.responsiveAudits[viewport.name].auxiliaryWindows = {
		count: windows.length,
		visibleCount: windows.filter((window) => window.width > 0 && window.height > 0 && window.visibility !== "hidden").length,
		windows,
	};
	const target = windows.find((window) => window.width > 0 && window.height > 0 && window.visibility !== "hidden");
	if (!target) return;
	const x = target.x + 24;
	const y = target.y + 16;
	await session.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
	await session.client.call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
	for (let step = 1; step <= 10; step += 1) {
		await session.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 12 * step, y: y - 6 * step, button: "left", buttons: 1 });
		await wait(16);
	}
	await session.client.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + 120, y: y - 60, button: "left", buttons: 0, clickCount: 1 });
	await wait(180);
	const after = await session.evaluate(`(() => { const element = document.querySelector("[data-opaline-claude-window]"); const rect = element?.getBoundingClientRect(); return rect ? { x: rect.x, y: rect.y } : null; })()`);
	metadata.responsiveAudits[viewport.name].auxiliaryWindows.drag = {
		requestedDelta: { x: 120, y: -60 },
		before: { x: target.x, y: target.y },
		after,
		actualDelta: after ? { x: after.x - target.x, y: after.y - target.y } : null,
	};
	await shot({ session, viewport, state: "auxiliary-window-dragged", scrollY: 500, scenario: ["drag first visible auxiliary window +120,-60"] });
};

const focusStates = async (session, viewport) => {
	await session.scrollTo(0);
	await wait(400);
	const cta = await moveTo(session, `[...document.querySelectorAll("a,button")].find((node) => node.textContent?.includes("Get Early Access"))`);
	if (cta) {
		await wait(120);
		await shot({ session, viewport, state: "button-hover", scrollY: 0, scenario: ["hover Get Early Access"] });
	}
	for (let index = 0; index < 3; index += 1) {
		for (const type of ["keyDown", "keyUp"]) {
			await session.client.call("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab" });
		}
	}
	await wait(120);
	await shot({ session, viewport, state: "focus-visible", scrollY: 0, scenario: ["press Tab three times"] });
};

await mkdir(outputDirectory, { recursive: true });
for (const viewport of viewports) {
	metadata.responsiveAudits[viewport.name] = {};
	const mid = await createBrowserSession({ url, ...viewport, dpr: 1 });
	try {
		await mid.completeAperture(0.5);
		await shot({ session: mid, viewport, state: "aperture-mid", scrollY: 0, scenario: ["wheel aperture to progress 0.5"] });
	} finally {
		await mid.close();
	}

	const session = await createBrowserSession({ url, ...viewport, dpr: 1 });
	try {
		await session.completeAperture(1);
		await session.scrollTo(500);
		await wait(500);
		await session.scrollTo(0);
		await wait(500);
		for (const state of [
			{ name: "hero-focus", scrollY: 500 },
			{ name: "top", scrollY: 0 },
			{ name: "hero-end", scrollY: 1180 },
		]) {
			await session.scrollTo(state.scrollY);
			await wait(500);
			await shot({ session, viewport, state: state.name, scrollY: state.scrollY, scenario: [`scroll to ${state.scrollY}`] });
		}
		const anchors = await session.evaluate(`(() => {
			const main = document.querySelector("[data-opaline-lens-content] > main");
			if (!main) throw new Error("Owned Lens content root missing");
			const sections = [...main.querySelectorAll("section")]
				.filter((node) => !node.parentElement?.closest("section"))
				.filter((node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return rect.height > 1 && style.display !== "none" && style.visibility !== "hidden"; })
				.map((node, index) => ({ index, top: node.getBoundingClientRect().top + scrollY, height: node.getBoundingClientRect().height, label: node.textContent.trim().replace(/\\s+/g, " ").slice(0, 80) }));
			const footer = main.querySelector("footer");
			return { sections, footerScrollY: footer.getBoundingClientRect().top + scrollY + footer.getBoundingClientRect().height };
		})()`);
		metadata.sections[viewport.name] = anchors;
		metadata.responsiveAudits[viewport.name].sections = { discovered: anchors.sections.length, visible: anchors.sections.length, hidden: [] };
		for (const section of anchors.sections) {
			await session.scrollTo(section.top);
			await wait(120);
			await shot({ session, viewport, state: `section-${String(section.index + 1).padStart(2, "0")}`, scrollY: section.top, scenario: [`scroll to owned section ${section.index}`] });
		}
		await session.scrollTo(anchors.footerScrollY);
		await wait(120);
		await shot({ session, viewport, state: "footer", scrollY: anchors.footerScrollY, scenario: ["scroll to document end"] });
		await navbarStates(session, viewport);
		await dashboardStates(session, viewport);
		await focusStates(session, viewport);
	} finally {
		await session.close();
	}

	const reduced = await createBrowserSession({ url, ...viewport, dpr: 1, reducedMotion: true });
	try {
		await reduced.completeAperture(1);
		await reduced.scrollTo(0);
		await wait(400);
		await shot({ session: reduced, viewport, state: "reduced-motion", scrollY: 0, mode: "prefers-reduced-motion", scenario: ["reduced motion before navigation"] });
	} finally {
		await reduced.close();
	}

	const rawNoJs = await createBrowserSession({ url, ...viewport, dpr: 1, javascriptDisabled: true });
	try {
		await wait(400);
		await shot({ session: rawNoJs, viewport, state: "js-disabled-reference-raw", scrollY: 0, mode: "scripts-disabled-before-navigation", scenario: ["disable scripts before navigation"], weakHistogram: true });
	} finally {
		await rawNoJs.close();
	}

	const noJs = await createBrowserSession({ url, ...viewport, dpr: 1 });
	try {
		await noJs.completeAperture(1);
		await noJs.scrollTo(0);
		await wait(400);
		await noJs.client.call("Emulation.setScriptExecutionDisabled", { value: true });
		await shot({ session: noJs, viewport, state: "js-disabled", scrollY: 0, mode: "scripts-disabled-after-settle", scenario: ["settle, then disable scripts"] });
	} finally {
		await noJs.close();
	}
}

await writeFile(path.join(outputDirectory, "matrix.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, shots: metadata.shots.length }, null, 2));
