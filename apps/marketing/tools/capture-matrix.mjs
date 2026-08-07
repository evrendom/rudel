import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertNonBlank, imageHistogram } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

export const referenceViewports = [
	{ name: "phone", width: 390, height: 844 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "desktop", width: 1280, height: 800 },
	{ name: "wide", width: 1680, height: 1050 },
];

const captureShot = async ({
	session,
	outputDirectory,
	viewport,
	state,
	metadata,
	scrollY = null,
	scenario = [],
	mode = "default",
	histogramValidation,
}) => {
	const filename = `${viewport.name}-${state}.png`;
	const outputPath = path.join(outputDirectory, filename);
	await session.screenshot(outputPath);
	const histogram = await imageHistogram(outputPath, {
		x: 0,
		y: 0,
		width: viewport.width,
		height: viewport.height,
	});
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

const sectionAnchors = async (session) => {
	const compositionFrame = await session.frameByName("lens-build-live");
	const contentFrame = await session.frameByName(
		"lens-attio-lens-content-source",
	);
	const stageTop = await session.evaluate(
		`(() => {
			const stage = document.querySelector("#lens-attio-lens-content-stage");
			if (!stage) return 0;
			return stage.getBoundingClientRect().top + scrollY;
		})()`,
		{ frameId: compositionFrame.id },
	);
	const content = await session.evaluate(
		`(() => {
			const allSections = [...document.querySelectorAll("section")]
				.filter((node) => !node.parentElement?.closest("section"))
				.map((node, index) => {
					const rect = node.getBoundingClientRect();
					const style = getComputedStyle(node);
					return {
						index,
						top: rect.top,
						height: rect.height,
						label: node.textContent?.trim().replace(/\\s+/g, " ").slice(0, 80) ?? "",
						display: style.display,
						visibility: style.visibility,
					};
				});
			const sections = allSections.filter(
				(section) =>
					section.height > 1 &&
					section.display !== "none" &&
					section.visibility !== "hidden",
			);
			return { sections, allSections, height: document.documentElement.scrollHeight };
		})()`,
		{ frameId: contentFrame.id },
	);
	return {
		sections: content.sections.map((section, index) => ({
			...section,
			name: `section-${String(index + 1).padStart(2, "0")}`,
			scrollY: stageTop + section.top,
		})),
		footerScrollY: stageTop + content.height,
		allSections: content.allSections,
	};
};

const captureNavbarStates = async ({
	session,
	outputDirectory,
	viewport,
	metadata,
}) => {
	const navbarFrame = await session.frameByName("lens-attio-navbar-source");
	if (viewport.width < 768) {
		const menu = await session.evaluate(
			`(() => {
				const button = document.querySelector('button[aria-haspopup="dialog"]');
				if (!button) return false;
				button.click();
				return true;
			})()`,
			{ frameId: navbarFrame.id },
		);
		if (menu) {
			await wait(250);
			await captureShot({
				session,
				outputDirectory,
				viewport,
				state: "mobile-menu-open",
				metadata,
				scrollY: 0,
				scenario: [
					"complete aperture",
					"scroll to 0",
					"click mobile menu trigger",
				],
			});
		}
		return;
	}

	const triggerRect = async (label) =>
		await session.evaluate(
			`(() => {
				const trigger = [...document.querySelectorAll("button, a")].find((candidate) =>
					candidate.textContent?.trim() === ${JSON.stringify(label)},
				);
				if (!trigger) return null;
				const box = trigger.getBoundingClientRect();
				return { x: box.x, y: box.y, width: box.width, height: box.height };
			})()`,
			{ frameId: navbarFrame.id },
		);
	const moveTo = async (rect) => {
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		});
	};

	const productRect = await triggerRect("Product");
	const resourcesRect = await triggerRect("Resources");
	if (productRect) {
		await moveTo(productRect);
		await wait(350);
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: "navbar-product-open",
			metadata,
			scrollY: 0,
			scenario: ["complete aperture", "scroll to 0", "hover Product for 350ms"],
		});

		const itemRect = await session.evaluate(
			`(() => {
				const item = [...document.querySelectorAll("a")].find((candidate) => {
					const rect = candidate.getBoundingClientRect();
					return rect.width > 100 && rect.height > 30 && rect.y > 70;
				});
				if (!item) return null;
				const rect = item.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			})()`,
			{ frameId: navbarFrame.id },
		);
		if (itemRect) {
			await moveTo(itemRect);
			await wait(100);
			await captureShot({
				session,
				outputDirectory,
				viewport,
				state: "navbar-item-hover",
				metadata,
				scrollY: 0,
				scenario: ["open Product", "hover first visible menu item for 100ms"],
			});
			await moveTo(productRect);
			await wait(80);
		}
	}

	if (resourcesRect) {
		await moveTo(resourcesRect);
		await wait(90);
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: "navbar-switch-mid",
			metadata,
			scrollY: 0,
			scenario: ["open Product", "move to Resources", "capture after 90ms"],
		});
		await wait(260);
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: "navbar-resources-open",
			metadata,
			scrollY: 0,
			scenario: ["open Product", "move to Resources", "settle for 350ms"],
		});
	}
	for (const type of ["keyDown", "keyUp"]) {
		await session.client.call("Input.dispatchKeyEvent", {
			type,
			key: "Escape",
			code: "Escape",
		});
	}
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: 8,
		y: Math.min(viewport.height - 8, 500),
	});
	await wait(260);
};

const captureDashboardStates = async ({
	session,
	outputDirectory,
	viewport,
	metadata,
}) => {
	const compositionFrame = await session.frameByName("lens-build-live");
	await session.scrollTo(500);
	await wait(500);

	const labels = await session.evaluate(
		`[...document.querySelectorAll("[data-opaline-use-case]")].map((button) => ({
			value: button.dataset.opalineUseCase,
			label: button.textContent.trim(),
		}))`,
		{ frameId: compositionFrame.id },
	);
	for (const option of labels) {
		await session.evaluate(
			`document.querySelector('[data-opaline-use-case=${JSON.stringify(option.value)}]')?.click()`,
			{ frameId: compositionFrame.id },
		);
		await wait(260);
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: `use-case-${option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
			metadata,
			scrollY: 500,
			scenario: [
				"complete aperture",
				"scroll to 500",
				`select ${option.label}`,
			],
		});
	}

	const windowAudit = await session.evaluate(
		`[...document.querySelectorAll("[data-opaline-claude-window]")].map((windowElement, index) => {
			const rect = windowElement.getBoundingClientRect();
			const style = getComputedStyle(windowElement);
			return {
				index,
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				display: style.display,
				visibility: style.visibility,
			};
		})`,
		{ frameId: compositionFrame.id },
	);
	metadata.responsiveAudits[viewport.name].auxiliaryWindows = {
		count: windowAudit.length,
		visibleCount: windowAudit.filter(
			(window) =>
				window.width > 0 && window.height > 0 && window.visibility !== "hidden",
		).length,
		windows: windowAudit,
	};
	const rect = windowAudit.find(
		(window) =>
			window.width > 0 && window.height > 0 && window.visibility !== "hidden",
	);
	if (rect) {
		const before = { x: rect.x, y: rect.y };
		const x = rect.x + 24;
		const y = rect.y + 16;
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x,
			y,
			button: "none",
			buttons: 0,
		});
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mousePressed",
			x,
			y,
			button: "left",
			buttons: 1,
			clickCount: 1,
		});
		for (let step = 1; step <= 10; step += 1) {
			await session.client.call("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: x + 12 * step,
				y: y - 6 * step,
				button: "left",
				buttons: 1,
			});
			await wait(16);
		}
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			x: x + 120,
			y: y - 60,
			button: "left",
			buttons: 0,
			clickCount: 1,
		});
		await wait(180);
		const after = await session.evaluate(
			`(() => {
					const windowElement = document.querySelector("[data-opaline-claude-window]");
					const rect = windowElement?.getBoundingClientRect();
					return rect ? { x: rect.x, y: rect.y } : null;
				})()`,
			{ frameId: compositionFrame.id },
		);
		const actualDelta = after
			? { x: after.x - before.x, y: after.y - before.y }
			: null;
		metadata.responsiveAudits[viewport.name].auxiliaryWindows.drag = {
			requestedDelta: { x: 120, y: -60 },
			before,
			after,
			actualDelta,
			supported:
				Boolean(actualDelta) &&
				(Math.abs(actualDelta.x) > 1 || Math.abs(actualDelta.y) > 1),
		};
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: "auxiliary-window-dragged",
			metadata,
			scrollY: 500,
			scenario: [
				"complete aperture",
				"scroll to 500",
				"drag first visible auxiliary window by +120px, -60px",
			],
		});
	}
};

const captureFocusStates = async ({
	session,
	outputDirectory,
	viewport,
	metadata,
}) => {
	await session.scrollTo(0);
	await wait(500);
	const titleFrame = await session.frameByName("lens-attio-title-source");
	const ctaRect = await session.evaluate(
		`(() => {
			const cta = [...document.querySelectorAll("a, button")].find((node) =>
				node.textContent?.includes("Get Early Access"),
			);
			if (!cta) return null;
			const rect = cta.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		})()`,
		{ frameId: titleFrame.id },
	);
	if (ctaRect) {
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: ctaRect.x + ctaRect.width / 2,
			y: ctaRect.y + ctaRect.height / 2,
		});
		await wait(120);
		await captureShot({
			session,
			outputDirectory,
			viewport,
			state: "button-hover",
			metadata,
			scrollY: 0,
			scenario: ["complete aperture", "scroll to 0", "hover Get Early Access"],
		});
	}

	for (let index = 0; index < 3; index += 1) {
		await session.client.call("Input.dispatchKeyEvent", {
			type: "keyDown",
			key: "Tab",
			code: "Tab",
		});
		await session.client.call("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "Tab",
			code: "Tab",
		});
	}
	await wait(120);
	await captureShot({
		session,
		outputDirectory,
		viewport,
		state: "focus-visible",
		metadata,
		scrollY: 0,
		scenario: ["complete aperture", "scroll to 0", "press Tab three times"],
	});
};

export const captureMatrix = async ({
	url,
	outputDirectory,
	viewports = referenceViewports,
	includeSections = true,
	includeInteractions = true,
	includeSpecialRenders = true,
}) => {
	await mkdir(outputDirectory, { recursive: true });
	const metadata = {
		url,
		capturedAt: new Date().toISOString(),
		viewports,
		shots: [],
		sections: {},
		responsiveAudits: {},
	};

	for (const viewport of viewports) {
		metadata.responsiveAudits[viewport.name] = {};
		const midSession = await createBrowserSession({ url, ...viewport, dpr: 1 });
		try {
			await midSession.completeAperture(0.5);
			await captureShot({
				session: midSession,
				outputDirectory,
				viewport,
				state: "aperture-mid",
				metadata,
				scrollY: 0,
				scenario: [
					"dispatch real wheel input until aperture progress reaches 0.5",
				],
			});
		} finally {
			await midSession.close();
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
				await captureShot({
					session,
					outputDirectory,
					viewport,
					state: state.name,
					metadata,
					scrollY: state.scrollY,
					scenario: [
						"complete aperture",
						`scroll to ${state.scrollY}`,
						"settle 500ms",
					],
				});
			}

			if (includeSections) {
				const anchors = await sectionAnchors(session);
				metadata.sections[viewport.name] = anchors;
				metadata.responsiveAudits[viewport.name].sections = {
					discovered: anchors.allSections.length,
					visible: anchors.sections.length,
					hidden: anchors.allSections.filter(
						(section) =>
							!anchors.sections.some(
								(visible) => visible.index === section.index,
							),
					),
				};
				for (const section of anchors.sections) {
					await session.scrollTo(section.scrollY);
					await wait(120);
					await captureShot({
						session,
						outputDirectory,
						viewport,
						state: section.name,
						metadata,
						scrollY: section.scrollY,
						scenario: [
							"complete aperture",
							`scroll to Lens section ${section.index}`,
						],
					});
				}
				await session.scrollTo(anchors.footerScrollY);
				await wait(120);
				await captureShot({
					session,
					outputDirectory,
					viewport,
					state: "footer",
					metadata,
					scrollY: anchors.footerScrollY,
					scenario: ["complete aperture", "scroll to document end"],
				});
			}

			if (includeInteractions) {
				await session.scrollTo(0);
				await wait(500);
				await captureNavbarStates({
					session,
					outputDirectory,
					viewport,
					metadata,
				});
				await captureDashboardStates({
					session,
					outputDirectory,
					viewport,
					metadata,
				});
				await captureFocusStates({
					session,
					outputDirectory,
					viewport,
					metadata,
				});
			}
		} finally {
			await session.close();
		}

		if (includeSpecialRenders) {
			const reducedSession = await createBrowserSession({
				url,
				...viewport,
				dpr: 1,
				reducedMotion: true,
			});
			try {
				await reducedSession.completeAperture(1);
				await reducedSession.scrollTo(500);
				await wait(300);
				await reducedSession.scrollTo(0);
				await wait(400);
				await captureShot({
					session: reducedSession,
					outputDirectory,
					viewport,
					state: "reduced-motion",
					metadata,
					scrollY: 0,
					scenario: [
						"emulate prefers-reduced-motion: reduce before navigation",
						"render settled page without aperture animation",
					],
					mode: "prefers-reduced-motion",
				});
			} finally {
				await reducedSession.close();
			}

			const rawNoJsSession = await createBrowserSession({
				url,
				...viewport,
				dpr: 1,
				javascriptDisabled: true,
			});
			try {
				await wait(400);
				await captureShot({
					session: rawNoJsSession,
					outputDirectory,
					viewport,
					state: "js-disabled-reference-raw",
					metadata,
					scrollY: 0,
					scenario: [
						"disable script execution before navigation",
						"capture the reference's literal no-JS result",
					],
					mode: "scripts-disabled-before-navigation",
					histogramValidation: {
						minimumQuantizedColors: 2,
						minimumNonWhitePercent: 0.05,
					},
				});
			} finally {
				await rawNoJsSession.close();
			}

			const noJsSession = await createBrowserSession({
				url,
				...viewport,
				dpr: 1,
			});
			try {
				await noJsSession.completeAperture(1);
				await noJsSession.scrollTo(500);
				await wait(300);
				await noJsSession.scrollTo(0);
				await wait(400);
				await noJsSession.client.call("Emulation.setScriptExecutionDisabled", {
					value: true,
				});
				await captureShot({
					session: noJsSession,
					outputDirectory,
					viewport,
					state: "js-disabled",
					metadata,
					scrollY: 0,
					scenario: [
						"settle the reference composition",
						"disable script execution",
						"capture the frozen no-runtime target for the Astro rebuild",
					],
					mode: "scripts-disabled-after-reference-settle",
				});
			} finally {
				await noJsSession.close();
			}
		}
	}

	await writeFile(
		path.join(outputDirectory, "matrix.json"),
		`${JSON.stringify(metadata, null, 2)}\n`,
	);
	return metadata;
};

const parseArguments = (arguments_) => {
	const options = {};
	for (let index = 0; index < arguments_.length; index += 1) {
		const key = arguments_[index];
		if (key === "--no-sections") options.includeSections = false;
		else if (key === "--no-interactions") options.includeInteractions = false;
		else if (key === "--no-special-renders")
			options.includeSpecialRenders = false;
		else if (key.startsWith("--")) options[key.slice(2)] = arguments_[++index];
	}
	return options;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const options = parseArguments(process.argv.slice(2));
	if (!options.url || !options.output) {
		throw new Error(
			"Usage: node tools/capture-matrix.mjs --url <url> --output <directory> [--no-sections] [--no-interactions]",
		);
	}
	const metadata = await captureMatrix({
		url: options.url,
		outputDirectory: path.resolve(options.output),
		includeSections: options.includeSections ?? true,
		includeInteractions: options.includeInteractions ?? true,
		includeSpecialRenders: options.includeSpecialRenders ?? true,
	});
	console.log(
		JSON.stringify(
			{
				output: path.resolve(options.output),
				shots: metadata.shots.length,
			},
			null,
			2,
		),
	);
}
