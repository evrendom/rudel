import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CHROME_ORIGIN =
	process.env.CHROME_DEBUG_ORIGIN ?? "http://127.0.0.1:9254";

const wait = (duration) =>
	new Promise((resolve) => setTimeout(resolve, duration));

class CdpClient {
	constructor(socket) {
		this.socket = socket;
		this.nextId = 0;
		this.pending = new Map();
		this.listeners = new Map();

		socket.addEventListener("message", (event) => {
			const message = JSON.parse(event.data);
			if (message.id && this.pending.has(message.id)) {
				const request = this.pending.get(message.id);
				this.pending.delete(message.id);
				clearTimeout(request.timeout);
				if (message.error) request.reject(new Error(message.error.message));
				else request.resolve(message.result);
				return;
			}

			for (const listener of this.listeners.get(message.method) ?? []) {
				listener(message.params);
			}
		});
	}

	call(method, params = {}) {
		return new Promise((resolve, reject) => {
			const id = ++this.nextId;
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP command timed out: ${method}`));
			}, 180_000);
			this.pending.set(id, { resolve, reject, timeout });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	on(method, listener) {
		const listeners = this.listeners.get(method) ?? [];
		listeners.push(listener);
		this.listeners.set(method, listeners);
		return () => {
			this.listeners.set(
				method,
				(this.listeners.get(method) ?? []).filter(
					(candidate) => candidate !== listener,
				),
			);
		};
	}

	close() {
		this.socket.close();
	}
}

const connect = async (webSocketDebuggerUrl) => {
	const socket = new WebSocket(webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", reject, { once: true });
	});
	return new CdpClient(socket);
};

const flattenFrames = (frameTree, depth = 0, result = []) => {
	result.push({ ...frameTree.frame, depth });
	for (const child of frameTree.childFrames ?? []) {
		flattenFrames(child, depth + 1, result);
	}
	return result;
};

const stabilizationStyle = `
	*, *::before, *::after { caret-color: transparent !important; }
	html { scrollbar-width: none !important; }
	::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
`;

export class BrowserSession {
	constructor({ client, target, chromeOrigin, viewport }) {
		this.client = client;
		this.target = target;
		this.chromeOrigin = chromeOrigin;
		this.viewport = viewport;
		this.networkRequests = new Set();
		this.lastNetworkActivity = Date.now();
	}

	async initialize({ reducedMotion = false, javascriptDisabled = false } = {}) {
		await Promise.all([
			this.client.call("Page.enable"),
			this.client.call("Runtime.enable"),
			this.client.call("Network.enable"),
			this.client.call("DOM.enable"),
		]);
		await this.client.call("Page.bringToFront");

		const networkStart = ({ requestId, type, request }) => {
			const hostname = (() => {
				try {
					return new URL(request.url).hostname;
				} catch {
					return "";
				}
			})();
			if (
				!["WebSocket", "EventSource", "Media"].includes(type) &&
				["127.0.0.1", "localhost"].includes(hostname)
			) {
				this.networkRequests.add(requestId);
			}
			this.lastNetworkActivity = Date.now();
		};
		const networkEnd = ({ requestId }) => {
			this.networkRequests.delete(requestId);
			this.lastNetworkActivity = Date.now();
		};
		this.client.on("Network.requestWillBeSent", networkStart);
		this.client.on("Network.loadingFinished", networkEnd);
		this.client.on("Network.loadingFailed", networkEnd);

		await this.client.call("Emulation.setDeviceMetricsOverride", {
			width: this.viewport.width,
			height: this.viewport.height,
			deviceScaleFactor: this.viewport.dpr,
			mobile: this.viewport.mobile ?? false,
		});
		await this.client.call("Emulation.setEmulatedMedia", {
			media: "screen",
			features: [
				{
					name: "prefers-reduced-motion",
					value: reducedMotion ? "reduce" : "no-preference",
				},
			],
		});
		if (javascriptDisabled) {
			await this.client.call("Emulation.setScriptExecutionDisabled", {
				value: true,
			});
		}
		await this.client.call("Page.addScriptToEvaluateOnNewDocument", {
			source: `
				(() => {
					const install = () => {
						const style = document.createElement("style");
						style.dataset.opalineCaptureStabilizer = "";
						style.textContent = ${JSON.stringify(stabilizationStyle)};
						(document.head || document.documentElement).append(style);
					};
					if (document.readyState === "loading") {
						document.addEventListener("DOMContentLoaded", install, { once: true });
					} else install();
				})();
			`,
		});
	}

	async navigate(url) {
		this.networkRequests.clear();
		this.lastNetworkActivity = Date.now();
		await this.client.call("Page.navigate", { url });
		await this.waitFor('document.readyState === "complete"', {
			timeout: 20_000,
		});
		await this.waitForNetworkIdle();
		await this.waitForFonts();
		await wait(250);
	}

	async frameTree() {
		const { frameTree } = await this.client.call("Page.getFrameTree");
		return flattenFrames(frameTree);
	}

	async contentFrame() {
		const frames = await this.frameTree();
		return (
			frames.find((frame) => frame.name === "lens-build-live") ??
			frames.toSorted((left, right) => right.depth - left.depth)[0]
		);
	}

	async frameByName(name) {
		const frame = (await this.frameTree()).find(
			(candidate) => candidate.name === name,
		);
		if (!frame) throw new Error(`Frame not found: ${name}`);
		return frame;
	}

	async contextForFrame(frameId) {
		const world = await this.client.call("Page.createIsolatedWorld", {
			frameId,
			worldName: `opaline-gate-${Date.now()}-${Math.random()}`,
		});
		return world.executionContextId;
	}

	async evaluate(
		expression,
		{ frameId, awaitPromise = false, returnByValue = true } = {},
	) {
		const frames = await this.frameTree();
		const selectedFrameId = frameId ?? frames[0].id;
		const contextId = await this.contextForFrame(selectedFrameId);
		const result = await this.client.call("Runtime.evaluate", {
			contextId,
			expression,
			awaitPromise,
			returnByValue,
		});
		if (result.exceptionDetails) {
			throw new Error(
				result.exceptionDetails.exception?.description ??
					result.exceptionDetails.text ??
					"CDP evaluation failed",
			);
		}
		return result.result.value;
	}

	async waitFor(expression, { frameId, timeout = 10_000 } = {}) {
		const startedAt = Date.now();
		while (true) {
			try {
				if (await this.evaluate(expression, { frameId })) return;
			} catch (error) {
				if (Date.now() - startedAt > timeout) throw error;
			}
			if (Date.now() - startedAt > timeout) {
				throw new Error(`Timed out waiting for: ${expression}`);
			}
			await wait(50);
		}
	}

	async waitForNetworkIdle({ idleFor = 600, timeout = 20_000 } = {}) {
		const startedAt = Date.now();
		while (true) {
			if (Date.now() - this.lastNetworkActivity >= idleFor) {
				return;
			}
			if (Date.now() - startedAt > timeout) {
				throw new Error(
					`Network did not become idle (${this.networkRequests.size} pending requests)`,
				);
			}
			await wait(50);
		}
	}

	async waitForFonts() {
		for (const frame of await this.frameTree()) {
			await this.evaluate(
				"document.fonts ? document.fonts.ready.then(() => true) : true",
				{ frameId: frame.id, awaitPromise: true },
			);
		}
	}

	async completeAperture(targetProgress = 1) {
		const rootFrame = (await this.frameTree())[0];
		const apertureExists = await this.evaluate(
			'Boolean(document.querySelector("#opaline-aperture-mark") || document.querySelector("[data-aperture-curtain]"))',
			{ frameId: rootFrame.id },
		);
		if (!apertureExists) return;

		const target = Math.min(1, Math.max(0, targetProgress));
		for (let attempt = 0; attempt < 40; attempt += 1) {
			const state = await this.evaluate(
				`(() => ({
					progress: Number(document.documentElement.dataset.opalineProgress ?? (document.documentElement.dataset.aperture === "released" ? 1 : 0)),
					complete: document.documentElement.hasAttribute("data-opaline-complete") || document.documentElement.dataset.aperture === "released",
					range: Math.max(720, innerHeight * 1.1),
				}))()`,
				{ frameId: rootFrame.id },
			);
			if (
				(target === 1 && state.complete) ||
				(target < 1 && state.progress >= target - 0.0005)
			) {
				break;
			}
			const remainingDistance = (target - state.progress) * state.range;
			const deltaY = Math.max(1, Math.min(120, remainingDistance));
			await this.client.call("Input.dispatchMouseEvent", {
				type: "mouseWheel",
				x: this.viewport.width / 2,
				y: this.viewport.height / 2,
				deltaX: 0,
				deltaY,
			});
			await wait(32);
		}

		if (target === 1) {
			await this.waitFor(
				'document.documentElement.hasAttribute("data-opaline-complete") || document.documentElement.dataset.aperture === "released"',
				{ frameId: rootFrame.id, timeout: 3_000 },
			);
		}
		await wait(target === 1 ? 500 : 120);
	}

	async scrollTo(scrollY) {
		const frame = await this.contentFrame();
		await this.evaluate(
			`new Promise((resolve) => {
				scrollTo(0, ${Number(scrollY)});
				requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY)));
			})`,
			{ frameId: frame.id, awaitPromise: true },
		);
	}

	async freezeAtDeterministicState() {
		await this.client.call("Emulation.setScriptExecutionDisabled", {
			value: true,
		});
		for (const frame of await this.frameTree()) {
			await this.evaluate(
				`(() => {
					for (const animation of document.getAnimations({ subtree: true })) {
						try {
							animation.cancel();
						} catch {}
					}
					const style = document.createElement("style");
					style.dataset.opalineDeterministicFreeze = "";
					style.textContent = ${JSON.stringify(`
						*, *::before, *::after {
							animation: none !important;
							transition: none !important;
						}
					`)};
					(document.head || document.documentElement).append(style);
					return document.getAnimations({ subtree: true }).length;
				})()`,
				{ frameId: frame.id },
			);
		}
		await wait(120);
	}

	async screenshot(outputPath) {
		const screenshot = await this.client.call("Page.captureScreenshot", {
			format: "png",
			fromSurface: true,
			captureBeyondViewport: false,
		});
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
	}

	async computedStyleProperties() {
		const properties = new Set();
		for (const frame of await this.frameTree()) {
			const frameProperties = await this.evaluate(
				"Array.from(getComputedStyle(document.documentElement))",
				{ frameId: frame.id },
			);
			for (const property of frameProperties) properties.add(property);
		}
		return [...properties]
			.filter((property) => !property.startsWith("--"))
			.sort();
	}

	async snapshot(
		metadata = {},
		{
			allowMultipleDocuments = false,
			batchSize = 16,
			freezeScripts = allowMultipleDocuments,
			onProgress = () => {},
		} = {},
	) {
		const computedStyles = await this.computedStyleProperties();
		if (freezeScripts) {
			await this.client.call("Emulation.setScriptExecutionDisabled", {
				value: true,
			});
		}
		const baseSnapshot = await this.client.call("DOMSnapshot.captureSnapshot", {
			computedStyles: [],
			includePaintOrder: true,
			includeDOMRects: true,
			includeBlendedBackgroundColors: true,
			includeTextColorOpacities: true,
		});
		if (baseSnapshot.documents.length > 2 && !allowMultipleDocuments) {
			throw new Error(
				"Exhaustive structural snapshots must target an isolated component source route; the integration composition contains too many nested documents",
			);
		}
		if (baseSnapshot.documents.length > 2) {
			const styleBatches = [];
			for (
				let offset = 0;
				offset < computedStyles.length;
				offset += batchSize
			) {
				const properties = computedStyles.slice(offset, offset + batchSize);
				onProgress({
					offset,
					total: computedStyles.length,
					properties,
				});
				const batch = await this.client.call("DOMSnapshot.captureSnapshot", {
					computedStyles: properties,
					includePaintOrder: false,
					includeDOMRects: false,
				});
				if (batch.documents.length !== baseSnapshot.documents.length) {
					throw new Error(
						"The document tree changed while computed styles were captured",
					);
				}
				styleBatches.push({
					properties,
					strings: batch.strings,
					documents: batch.documents.map((document, documentIndex) => {
						const baseDocument = baseSnapshot.documents[documentIndex];
						if (
							document.layout.nodeIndex.length !==
							baseDocument.layout.nodeIndex.length
						) {
							throw new Error(
								"The layout tree changed while computed styles were captured",
							);
						}
						return {
							documentURL: batch.strings[document.documentURL],
							nodeIndex: document.layout.nodeIndex,
							styles: document.layout.styles,
						};
					}),
				});
			}
			return {
				format: "opaline-batched-dom-snapshot-v1",
				metadata: {
					...metadata,
					viewport: this.viewport,
					capturedAt: new Date().toISOString(),
				},
				computedStyles,
				baseSnapshot,
				styleBatches,
			};
		}
		const snapshot = await this.client.call("DOMSnapshot.captureSnapshot", {
			computedStyles,
			includePaintOrder: true,
			includeDOMRects: true,
			includeBlendedBackgroundColors: true,
			includeTextColorOpacities: true,
		});
		return {
			format: "opaline-dom-snapshot-v1",
			metadata: {
				...metadata,
				viewport: this.viewport,
				capturedAt: new Date().toISOString(),
			},
			computedStyles,
			snapshot,
		};
	}

	async canvasMasks() {
		const masks = [];
		for (const frame of await this.frameTree()) {
			const frameMasks = await this.evaluate(
				`[...document.querySelectorAll("canvas")].map((canvas) => {
					const rect = canvas.getBoundingClientRect();
					return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
				}).filter((rect) => rect.width > 0 && rect.height > 0)`,
				{ frameId: frame.id },
			);
			masks.push(...frameMasks);
		}
		return masks;
	}

	async close() {
		this.client.close();
		await fetch(`${this.chromeOrigin}/json/close/${this.target.id}`);
	}
}

export const createBrowserSession = async ({
	url = "about:blank",
	width = 1280,
	height = 800,
	dpr = 1,
	mobile = false,
	reducedMotion = false,
	javascriptDisabled = false,
	chromeOrigin = DEFAULT_CHROME_ORIGIN,
} = {}) => {
	const response = await fetch(
		`${chromeOrigin}/json/new?${encodeURIComponent("about:blank")}`,
		{ method: "PUT" },
	);
	if (!response.ok) {
		throw new Error(`Could not create Chrome target: ${response.status}`);
	}
	const target = await response.json();
	const client = await connect(target.webSocketDebuggerUrl);
	const session = new BrowserSession({
		client,
		target,
		chromeOrigin,
		viewport: { width, height, dpr, mobile },
	});
	await session.initialize({ reducedMotion, javascriptDisabled });
	if (url !== "about:blank") await session.navigate(url);
	return session;
};

export { wait };
