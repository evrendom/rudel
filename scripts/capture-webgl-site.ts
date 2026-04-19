#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import process from "node:process";

interface CliOptions {
	closeTarget: boolean;
	endpoint: string;
	help: boolean;
	label: string | undefined;
	match: string | undefined;
	networkIdleMs: number;
	outputRoot: string;
	reload: boolean;
	settleMs: number;
	timeoutMs: number;
	url: string | undefined;
}

interface PageTarget {
	id: string;
	title: string;
	type: string;
	url: string;
	webSocketDebuggerUrl: string;
}

interface DevtoolsClient {
	close(): void;
	onEvent(
		method: string,
		listener: (params: Record<string, unknown>) => void,
	): () => void;
	sendCommand(
		method: string,
		params?: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
}

interface CaptureState {
	inflightRequestIds: Set<string>;
	lastNetworkActivityAt: number;
	recordsByRequestId: Map<string, CaptureRequestRecord>;
}

interface CaptureRequestRecord {
	bodyBytes: number | undefined;
	bodyCaptureError: string | undefined;
	bodyPath: string | undefined;
	encodedDataLength: number | undefined;
	failedText: string | undefined;
	finished: boolean;
	fromDiskCache: boolean;
	fromMemoryCache: boolean;
	fromPrefetchCache: boolean;
	fromServiceWorker: boolean;
	method: string;
	mimeType: string | undefined;
	requestHeaders: Record<string, string>;
	requestId: string;
	resourceType: string | undefined;
	responseHeaders: Record<string, string>;
	servedFromCacheEvent: boolean;
	startedAtIso: string | undefined;
	statusCode: number | undefined;
	statusText: string | undefined;
	url: string;
}

interface PageCanvasSnapshot {
	className: string;
	clientHeight: number;
	clientWidth: number;
	height: number;
	id: string;
	index: number;
	width: number;
}

interface PagePerformanceResourceSnapshot {
	decodedBodySize: number;
	durationMs: number;
	initiatorType: string;
	name: string;
	transferSize: number;
}

interface PageScriptSnapshot {
	async: boolean;
	defer: boolean;
	src: string;
	type: string;
}

interface PageStylesheetSnapshot {
	href: string;
	media: string;
}

interface PageMetadataSnapshot {
	canvasCount: number;
	canvases: readonly PageCanvasSnapshot[];
	resources: readonly PagePerformanceResourceSnapshot[];
	scripts: readonly PageScriptSnapshot[];
	stylesheets: readonly PageStylesheetSnapshot[];
	title: string;
	url: string;
	userAgent: string;
}

interface CaptureManifest {
	capturedAt: string;
	endpoint: string;
	options: {
		closeTarget: boolean;
		networkIdleMs: number;
		reload: boolean;
		settleMs: number;
		timeoutMs: number;
	};
	outputDirectory: string;
	pageMetadata: PageMetadataSnapshot | null;
	resources: readonly CaptureRequestRecord[];
	target: {
		id: string;
		title: string;
		type: string;
		url: string;
	};
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:9222";
const DEFAULT_NETWORK_IDLE_MS = 1_500;
const DEFAULT_OUTPUT_ROOT = ".context/webgl-captures";
const DEFAULT_SETTLE_MS = 6_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const HELP_TEXT = `
Usage:
  bun ./scripts/capture-webgl-site.ts --match <substring>
  bun ./scripts/capture-webgl-site.ts --url <https://target.example>

What it does:
  - Connects to a Chrome tab through the DevTools Protocol
  - Forces a clean reload with cache disabled and service worker bypassed
  - Saves network response bodies, HTML, screenshot, and page metadata
  - Writes everything under .context/webgl-captures/<timestamp>-<label>/

Requirements:
  1. Launch Chrome with remote debugging enabled, for example on macOS:
     open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/rudel-cdp
  2. Either open the target site in that browser and use --match, or let the script open a fresh tab with --url.

Examples:
  bun ./scripts/capture-webgl-site.ts --match mymind
  bun ./scripts/capture-webgl-site.ts --url https://example.com --label example-landing

Important limits:
  - This captures network-delivered assets and page state, not raw GPU memory.
  - WebGL buffers/textures generated entirely in memory may still need manual reconstruction.
`.trim();
const PAGE_METADATA_EXPRESSION = `
(() => {
  const canvases = Array.from(document.querySelectorAll("canvas")).map((canvas, index) => ({
    index,
    id: canvas.id || "",
    className: typeof canvas.className === "string" ? canvas.className : "",
    width: canvas.width,
    height: canvas.height,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
  }));

  const scripts = Array.from(document.scripts).map((script) => ({
    src: script.src || "",
    type: script.type || "",
    async: Boolean(script.async),
    defer: Boolean(script.defer),
  }));

  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((node) => ({
    href: node instanceof HTMLLinkElement ? node.href : "",
    media: node instanceof HTMLLinkElement ? node.media : "",
  }));

  const resources = performance.getEntriesByType("resource").map((entry) => ({
    name: "name" in entry ? entry.name : "",
    initiatorType: "initiatorType" in entry ? entry.initiatorType : "",
    transferSize: "transferSize" in entry ? entry.transferSize : 0,
    decodedBodySize: "decodedBodySize" in entry ? entry.decodedBodySize : 0,
    durationMs: Math.round(entry.duration),
  }));

  return JSON.stringify({
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    canvasCount: canvases.length,
    canvases,
    scripts,
    stylesheets,
    resources,
  });
})()
`.trim();

export async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.help) {
		console.log(HELP_TEXT);
		return;
	}

	const captureStartedAt = new Date();
	const target = await resolvePageTarget(options);
	const labelSource =
		options.label ?? options.match ?? target.title ?? target.url;
	const outputDirectory = join(
		options.outputRoot,
		`${formatTimestamp(captureStartedAt)}-${slugify(labelSource)}`,
	);

	await mkdir(outputDirectory, { recursive: true });

	console.log(`Connecting to ${target.url}`);
	console.log(`Writing capture to ${outputDirectory}`);

	const client = await connectToTarget(target.webSocketDebuggerUrl);
	const state = createCaptureState();
	const stopNetworkCapture = attachNetworkCapture(client, state);

	try {
		await initializeDevtoolsCapture(client);

		const loadPromise = waitForPageLoad(client, options.timeoutMs);

		if (options.reload) {
			await client.sendCommand("Page.reload", { ignoreCache: true });
		}

		const sawLoadEvent = await loadPromise;
		if (!sawLoadEvent) {
			console.warn(
				`Page.loadEventFired did not arrive within ${options.timeoutMs}ms; continuing anyway.`,
			);
		}

		await sleep(options.settleMs);
		await waitForNetworkIdle(state, options.networkIdleMs, options.timeoutMs);
		await captureResponseBodies(client, state, outputDirectory);

		const pageHtml = await evaluateExpression(client, "document.documentElement.outerHTML");
		const pageMetadata = await capturePageMetadata(client);
		const screenshot = await captureScreenshot(client);

		await writeFile(join(outputDirectory, "page.html"), pageHtml, "utf8");
		await writeFile(
			join(outputDirectory, "page-metadata.json"),
			`${JSON.stringify(pageMetadata, null, "\t")}\n`,
			"utf8",
		);
		await writeFile(join(outputDirectory, "page.png"), screenshot);

		const resources = Array.from(state.recordsByRequestId.values()).sort((left, right) =>
			left.url.localeCompare(right.url),
		);
		const manifest: CaptureManifest = {
			capturedAt: captureStartedAt.toISOString(),
			endpoint: options.endpoint,
			options: {
				closeTarget: options.closeTarget,
				networkIdleMs: options.networkIdleMs,
				reload: options.reload,
				settleMs: options.settleMs,
				timeoutMs: options.timeoutMs,
			},
			outputDirectory,
			pageMetadata,
			resources,
			target: {
				id: target.id,
				title: target.title,
				type: target.type,
				url: target.url,
			},
		};

		await writeFile(
			join(outputDirectory, "capture-manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
			"utf8",
		);

		const bodyCount = resources.filter((resource) => resource.bodyPath).length;
		const failureCount = resources.filter((resource) => resource.failedText).length;

		console.log(
			`Captured ${resources.length} requests, saved ${bodyCount} bodies, noted ${failureCount} failures.`,
		);
		console.log(`Done: ${outputDirectory}`);
	} finally {
		stopNetworkCapture();
		client.close();

		if (options.closeTarget) {
			await closeTarget(options.endpoint, target.id);
		}
	}
}

function attachNetworkCapture(
	client: DevtoolsClient,
	state: CaptureState,
): () => void {
	const unsubscribeRequest = client.onEvent(
		"Network.requestWillBeSent",
		(params) => {
			const requestId = readString(params, "requestId");
			if (!requestId) {
				return;
			}

			const request = readRecord(params, "request");
			if (!request) {
				return;
			}

			const record = getOrCreateRecord(state, requestId);
			record.method = readString(request, "method") ?? record.method;
			record.requestHeaders = readHeaders(request, "headers");
			record.url = readString(request, "url") ?? record.url;
			record.resourceType = readString(params, "type") ?? record.resourceType;
			record.failedText = undefined;
			record.finished = false;

			const wallTime = readNumber(params, "wallTime");
			if (wallTime !== undefined) {
				record.startedAtIso = new Date(wallTime * 1_000).toISOString();
			}

			state.inflightRequestIds.add(requestId);
			state.lastNetworkActivityAt = Date.now();
		},
	);

	const unsubscribeResponse = client.onEvent(
		"Network.responseReceived",
		(params) => {
			const requestId = readString(params, "requestId");
			if (!requestId) {
				return;
			}

			const response = readRecord(params, "response");
			if (!response) {
				return;
			}

			const record = getOrCreateRecord(state, requestId);
			record.url = readString(response, "url") ?? record.url;
			record.mimeType = readString(response, "mimeType") ?? record.mimeType;
			record.resourceType = readString(params, "type") ?? record.resourceType;
			record.statusCode = readNumber(response, "status") ?? record.statusCode;
			record.statusText = readString(response, "statusText") ?? record.statusText;
			record.responseHeaders = readHeaders(response, "headers");
			record.fromDiskCache =
				readBoolean(response, "fromDiskCache") ?? record.fromDiskCache;
			record.fromPrefetchCache =
				readBoolean(response, "fromPrefetchCache") ?? record.fromPrefetchCache;
			record.fromServiceWorker =
				readBoolean(response, "fromServiceWorker") ?? record.fromServiceWorker;
			state.lastNetworkActivityAt = Date.now();
		},
	);

	const unsubscribeCache = client.onEvent(
		"Network.requestServedFromCache",
		(params) => {
			const requestId = readString(params, "requestId");
			if (!requestId) {
				return;
			}

			const record = getOrCreateRecord(state, requestId);
			record.fromMemoryCache = true;
			record.servedFromCacheEvent = true;
			state.lastNetworkActivityAt = Date.now();
		},
	);

	const unsubscribeFinished = client.onEvent(
		"Network.loadingFinished",
		(params) => {
			const requestId = readString(params, "requestId");
			if (!requestId) {
				return;
			}

			const record = getOrCreateRecord(state, requestId);
			record.encodedDataLength =
				readNumber(params, "encodedDataLength") ?? record.encodedDataLength;
			record.finished = true;
			state.inflightRequestIds.delete(requestId);
			state.lastNetworkActivityAt = Date.now();
		},
	);

	const unsubscribeFailed = client.onEvent(
		"Network.loadingFailed",
		(params) => {
			const requestId = readString(params, "requestId");
			if (!requestId) {
				return;
			}

			const record = getOrCreateRecord(state, requestId);
			record.failedText = readString(params, "errorText") ?? "Unknown network failure";
			record.finished = false;
			state.inflightRequestIds.delete(requestId);
			state.lastNetworkActivityAt = Date.now();
		},
	);

	return () => {
		unsubscribeRequest();
		unsubscribeResponse();
		unsubscribeCache();
		unsubscribeFinished();
		unsubscribeFailed();
	};
}

async function capturePageMetadata(
	client: DevtoolsClient,
): Promise<PageMetadataSnapshot | null> {
	const payload = await evaluateExpression(client, PAGE_METADATA_EXPRESSION);
	const parsed = safeParseJson(payload);

	if (!isRecord(parsed)) {
		return null;
	}

	return {
		canvasCount: readNumber(parsed, "canvasCount") ?? 0,
		canvases: parseCanvasSnapshots(parsed),
		resources: parsePerformanceResources(parsed),
		scripts: parseScriptSnapshots(parsed),
		stylesheets: parseStylesheetSnapshots(parsed),
		title: readString(parsed, "title") ?? "",
		url: readString(parsed, "url") ?? "",
		userAgent: readString(parsed, "userAgent") ?? "",
	};
}

async function captureResponseBodies(
	client: DevtoolsClient,
	state: CaptureState,
	outputDirectory: string,
): Promise<void> {
	const records = Array.from(state.recordsByRequestId.values()).sort((left, right) =>
		left.url.localeCompare(right.url),
	);

	for (const record of records) {
		if (!shouldCaptureBody(record)) {
			continue;
		}

		try {
			const result = await client.sendCommand("Network.getResponseBody", {
				requestId: record.requestId,
			});
			const body = readString(result, "body");

			if (body === undefined) {
				record.bodyCaptureError = "Network.getResponseBody returned no body.";
				continue;
			}

			const isBase64Encoded = readBoolean(result, "base64Encoded") ?? false;
			const contents = isBase64Encoded
				? Buffer.from(body, "base64")
				: Buffer.from(body, "utf8");
			const relativePath = buildResourcePath(record.url, record.mimeType);
			const absolutePath = join(outputDirectory, relativePath);

			await mkdir(dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, contents);

			record.bodyBytes = contents.byteLength;
			record.bodyPath = relativePath;
		} catch (error) {
			record.bodyCaptureError = getErrorMessage(error);
		}
	}
}

async function captureScreenshot(client: DevtoolsClient): Promise<Buffer> {
	const result = await client.sendCommand("Page.captureScreenshot", {
		format: "png",
		fromSurface: true,
	});
	const data = readString(result, "data");

	if (!data) {
		throw new Error("Page.captureScreenshot returned no data.");
	}

	return Buffer.from(data, "base64");
}

async function closeTarget(endpoint: string, targetId: string): Promise<void> {
	const response = await fetch(`${normalizeEndpoint(endpoint)}/json/close/${targetId}`);
	if (!response.ok) {
		console.warn(`Could not close target ${targetId}: ${response.status}`);
	}
}

async function connectToTarget(webSocketDebuggerUrl: string): Promise<DevtoolsClient> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(webSocketDebuggerUrl);
		const eventListeners = new Map<
			string,
			Set<(params: Record<string, unknown>) => void>
		>();
		const pending = new Map<
			number,
			{
				method: string;
				reject: (reason?: unknown) => void;
				resolve: (value: Record<string, unknown>) => void;
			}
		>();
		let nextId = 1;
		let opened = false;

		const openTimeout = setTimeout(() => {
			reject(
				new Error(
					`Timed out while connecting to DevTools websocket ${webSocketDebuggerUrl}`,
				),
			);
		}, 10_000);

		socket.addEventListener("open", () => {
			opened = true;
			clearTimeout(openTimeout);

			resolve({
				close() {
					socket.close();
				},
				onEvent(method, listener) {
					const listenersForMethod =
						eventListeners.get(method) ?? new Set<(params: Record<string, unknown>) => void>();
					listenersForMethod.add(listener);
					eventListeners.set(method, listenersForMethod);

					return () => {
						const current = eventListeners.get(method);
						if (!current) {
							return;
						}

						current.delete(listener);
						if (current.size === 0) {
							eventListeners.delete(method);
						}
					};
				},
				sendCommand(method, params = {}) {
					return new Promise((resolveCommand, rejectCommand) => {
						if (socket.readyState !== WebSocket.OPEN) {
							rejectCommand(
								new Error(
									`Cannot send ${method}; websocket state is ${socket.readyState}.`,
								),
							);
							return;
						}

						const id = nextId;
						nextId += 1;
						pending.set(id, {
							method,
							reject: rejectCommand,
							resolve: resolveCommand,
						});
						socket.send(JSON.stringify({ id, method, params }));
					});
				},
			});
		});

		socket.addEventListener("close", () => {
			clearTimeout(openTimeout);
			for (const [, pendingCommand] of pending) {
				pendingCommand.reject(
					new Error(
						`DevTools websocket closed while waiting for ${pendingCommand.method}.`,
					),
				);
			}
			pending.clear();
		});

		socket.addEventListener("error", () => {
			if (!opened) {
				clearTimeout(openTimeout);
				reject(
					new Error(
						`Failed to connect to DevTools websocket ${webSocketDebuggerUrl}.`,
					),
				);
			}
		});

		socket.addEventListener("message", (event) => {
			void handleWebSocketMessage(event.data, pending, eventListeners);
		});
	});
}

function createCaptureState(): CaptureState {
	return {
		inflightRequestIds: new Set<string>(),
		lastNetworkActivityAt: Date.now(),
		recordsByRequestId: new Map<string, CaptureRequestRecord>(),
	};
}

function createEmptyRecord(requestId: string): CaptureRequestRecord {
	return {
		bodyBytes: undefined,
		bodyCaptureError: undefined,
		bodyPath: undefined,
		encodedDataLength: undefined,
		failedText: undefined,
		finished: false,
		fromDiskCache: false,
		fromMemoryCache: false,
		fromPrefetchCache: false,
		fromServiceWorker: false,
		method: "",
		mimeType: undefined,
		requestHeaders: {},
		requestId,
		resourceType: undefined,
		responseHeaders: {},
		servedFromCacheEvent: false,
		startedAtIso: undefined,
		statusCode: undefined,
		statusText: undefined,
		url: "",
	};
}

async function evaluateExpression(
	client: DevtoolsClient,
	expression: string,
): Promise<string> {
	const result = await client.sendCommand("Runtime.evaluate", {
		awaitPromise: true,
		expression,
		returnByValue: true,
	});
	const remoteObject = readRecord(result, "result");

	if (!remoteObject) {
		throw new Error("Runtime.evaluate returned no result object.");
	}

	const value = readString(remoteObject, "value");
	if (value !== undefined) {
		return value;
	}

	const description = readString(remoteObject, "description");
	throw new Error(
		`Runtime.evaluate did not yield a string result.${description ? ` ${description}` : ""}`,
	);
}

function formatTimestamp(date: Date): string {
	const year = date.getFullYear().toString();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	const hours = `${date.getHours()}`.padStart(2, "0");
	const minutes = `${date.getMinutes()}`.padStart(2, "0");
	const seconds = `${date.getSeconds()}`.padStart(2, "0");

	return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function getJson(endpoint: string): Promise<unknown> {
	const response = await fetch(endpoint);

	if (!response.ok) {
		throw new Error(`Request to ${endpoint} failed with ${response.status}.`);
	}

	return response.json();
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function getOrCreateRecord(
	state: CaptureState,
	requestId: string,
): CaptureRequestRecord {
	const existing = state.recordsByRequestId.get(requestId);
	if (existing) {
		return existing;
	}

	const record = createEmptyRecord(requestId);
	state.recordsByRequestId.set(requestId, record);
	return record;
}

async function handleWebSocketMessage(
	data: unknown,
	pending: Map<
		number,
		{
			method: string;
			reject: (reason?: unknown) => void;
			resolve: (value: Record<string, unknown>) => void;
		}
	>,
	eventListeners: Map<string, Set<(params: Record<string, unknown>) => void>>,
): Promise<void> {
	const payloadText = await readMessageData(data);
	if (!payloadText) {
		return;
	}

	const payload = safeParseJson(payloadText);
	if (!isRecord(payload)) {
		return;
	}

	const id = readNumber(payload, "id");
	if (id !== undefined) {
		const pendingCommand = pending.get(id);
		if (!pendingCommand) {
			return;
		}

		pending.delete(id);

		const protocolError = readRecord(payload, "error");
		if (protocolError) {
			const message =
				readString(protocolError, "message") ??
				`DevTools command ${pendingCommand.method} failed.`;
			pendingCommand.reject(new Error(message));
			return;
		}

		const result = readRecord(payload, "result") ?? {};
		pendingCommand.resolve(result);
		return;
	}

	const method = readString(payload, "method");
	if (!method) {
		return;
	}

	const listeners = eventListeners.get(method);
	if (!listeners || listeners.size === 0) {
		return;
	}

	const params = readRecord(payload, "params") ?? {};
	for (const listener of listeners) {
		listener(params);
	}
}

async function initializeDevtoolsCapture(client: DevtoolsClient): Promise<void> {
	await client.sendCommand("Page.enable");
	await client.sendCommand("Runtime.enable");
	await client.sendCommand("Network.enable");
	await client.sendCommand("Network.setCacheDisabled", { cacheDisabled: true });
	await client.sendCommand("Network.setBypassServiceWorker", { bypass: true });
}

function isPageTarget(target: PageTarget): boolean {
	return target.type === "page";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEndpoint(endpoint: string): string {
	return endpoint.replace(/\/+$/, "");
}

function parseArgs(argv: readonly string[]): CliOptions {
	let closeTarget = false;
	let endpoint = DEFAULT_ENDPOINT;
	let help = false;
	let label: string | undefined;
	let match: string | undefined;
	let networkIdleMs = DEFAULT_NETWORK_IDLE_MS;
	let outputRoot = DEFAULT_OUTPUT_ROOT;
	let reload = true;
	let settleMs = DEFAULT_SETTLE_MS;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	let url: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}

		if (arg === "--close-target") {
			closeTarget = true;
			continue;
		}

		if (arg === "--no-reload") {
			reload = false;
			continue;
		}

		if (arg === "--endpoint") {
			endpoint = readRequiredArg(argv, index, arg);
			index += 1;
			continue;
		}

		if (arg === "--label") {
			label = readRequiredArg(argv, index, arg);
			index += 1;
			continue;
		}

		if (arg === "--match") {
			match = readRequiredArg(argv, index, arg);
			index += 1;
			continue;
		}

		if (arg === "--network-idle-ms") {
			networkIdleMs = parsePositiveNumber(readRequiredArg(argv, index, arg), arg);
			index += 1;
			continue;
		}

		if (arg === "--output-root") {
			outputRoot = readRequiredArg(argv, index, arg);
			index += 1;
			continue;
		}

		if (arg === "--settle-ms") {
			settleMs = parsePositiveNumber(readRequiredArg(argv, index, arg), arg);
			index += 1;
			continue;
		}

		if (arg === "--timeout-ms") {
			timeoutMs = parsePositiveNumber(readRequiredArg(argv, index, arg), arg);
			index += 1;
			continue;
		}

		if (arg === "--url") {
			url = readRequiredArg(argv, index, arg);
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!help && !match && !url) {
		throw new Error("Pass either --match <substring> or --url <https://...>.");
	}

	if (match && url) {
		throw new Error("Use either --match or --url, not both.");
	}

	if (url) {
		closeTarget = true;
	}

	return {
		closeTarget,
		endpoint,
		help,
		label,
		match,
		networkIdleMs,
		outputRoot,
		reload,
		settleMs,
		timeoutMs,
		url,
	};
}

function parseCanvasSnapshots(
	payload: Record<string, unknown>,
): readonly PageCanvasSnapshot[] {
	const value = payload.canvases;
	if (!Array.isArray(value)) {
		return [];
	}

	const snapshots: PageCanvasSnapshot[] = [];

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		snapshots.push({
			className: readString(item, "className") ?? "",
			clientHeight: readNumber(item, "clientHeight") ?? 0,
			clientWidth: readNumber(item, "clientWidth") ?? 0,
			height: readNumber(item, "height") ?? 0,
			id: readString(item, "id") ?? "",
			index: readNumber(item, "index") ?? snapshots.length,
			width: readNumber(item, "width") ?? 0,
		});
	}

	return snapshots;
}

function parsePageTarget(payload: unknown): PageTarget | null {
	if (!isRecord(payload)) {
		return null;
	}

	const id = readString(payload, "id");
	const title = readString(payload, "title");
	const type = readString(payload, "type");
	const url = readString(payload, "url");
	const webSocketDebuggerUrl = readString(payload, "webSocketDebuggerUrl");

	if (!id || title === undefined || !type || !url || !webSocketDebuggerUrl) {
		return null;
	}

	return {
		id,
		title,
		type,
		url,
		webSocketDebuggerUrl,
	};
}

function parsePerformanceResources(
	payload: Record<string, unknown>,
): readonly PagePerformanceResourceSnapshot[] {
	const value = payload.resources;
	if (!Array.isArray(value)) {
		return [];
	}

	const resources: PagePerformanceResourceSnapshot[] = [];

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		resources.push({
			decodedBodySize: readNumber(item, "decodedBodySize") ?? 0,
			durationMs: readNumber(item, "durationMs") ?? 0,
			initiatorType: readString(item, "initiatorType") ?? "",
			name: readString(item, "name") ?? "",
			transferSize: readNumber(item, "transferSize") ?? 0,
		});
	}

	return resources;
}

function parsePositiveNumber(value: string, flagName: string): number {
	const parsed = Number(value);

	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flagName} expects a positive number. Received ${value}.`);
	}

	return parsed;
}

function parseScriptSnapshots(
	payload: Record<string, unknown>,
): readonly PageScriptSnapshot[] {
	const value = payload.scripts;
	if (!Array.isArray(value)) {
		return [];
	}

	const scripts: PageScriptSnapshot[] = [];

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		scripts.push({
			async: readBoolean(item, "async") ?? false,
			defer: readBoolean(item, "defer") ?? false,
			src: readString(item, "src") ?? "",
			type: readString(item, "type") ?? "",
		});
	}

	return scripts;
}

function parseStylesheetSnapshots(
	payload: Record<string, unknown>,
): readonly PageStylesheetSnapshot[] {
	const value = payload.stylesheets;
	if (!Array.isArray(value)) {
		return [];
	}

	const stylesheets: PageStylesheetSnapshot[] = [];

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		stylesheets.push({
			href: readString(item, "href") ?? "",
			media: readString(item, "media") ?? "",
		});
	}

	return stylesheets;
}

function readBoolean(
	record: Record<string, unknown>,
	key: string,
): boolean | undefined {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

function readHeaders(
	record: Record<string, unknown>,
	key: string,
): Record<string, string> {
	const headers = readRecord(record, key);
	if (!headers) {
		return {};
	}

	const output: Record<string, string> = {};

	for (const [headerKey, headerValue] of Object.entries(headers)) {
		output[headerKey] = stringifyHeaderValue(headerValue);
	}

	return output;
}

function readMessageData(data: unknown): Promise<string | undefined> {
	if (typeof data === "string") {
		return Promise.resolve(data);
	}

	if (data instanceof ArrayBuffer) {
		return Promise.resolve(new TextDecoder().decode(data));
	}

	if (ArrayBuffer.isView(data)) {
		return Promise.resolve(new TextDecoder().decode(data));
	}

	if (data instanceof Blob) {
		return data.text();
	}

	return Promise.resolve(undefined);
}

function readNumber(
	record: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" ? value : undefined;
}

function readRecord(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

function readRequiredArg(
	argv: readonly string[],
	index: number,
	flag: string,
): string {
	const value = argv[index + 1];
	if (!value) {
		throw new Error(`${flag} requires a value.`);
	}

	return value;
}

function readString(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

async function resolvePageTarget(options: CliOptions): Promise<PageTarget> {
	if (options.url) {
		return createTarget(options.endpoint, options.url);
	}

	const targets = await listTargets(options.endpoint);
	const pageTargets = targets.filter(isPageTarget);

	if (pageTargets.length === 0) {
		throw new Error(
			`No page targets were exposed by ${options.endpoint}. Is Chrome running with --remote-debugging-port?`,
		);
	}

	const match = options.match?.toLowerCase();
	if (!match) {
		return pageTargets[0];
	}

	const matchingTarget = pageTargets.find((target) => {
		return (
			target.title.toLowerCase().includes(match) ||
			target.url.toLowerCase().includes(match)
		);
	});

	if (!matchingTarget) {
		throw new Error(
			`Could not find a page target containing "${options.match}". Available targets:\n${pageTargets
				.map((target) => `- ${target.title} -> ${target.url}`)
				.join("\n")}`,
		);
	}

	return matchingTarget;
}

function safeParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function sanitizeSegment(segment: string): string {
	const decoded = safeDecodeURIComponent(segment);
	const sanitized = decoded
		.replace(/[^a-zA-Z0-9._-]+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (sanitized.length === 0) {
		return "item";
	}

	return sanitized.slice(0, 80);
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function shortHash(value: string): string {
	return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/https?:\/\//g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || "capture";
}

function stringifyHeaderValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return `${value}`;
	}

	return JSON.stringify(value) ?? "null";
}

function shouldCaptureBody(record: CaptureRequestRecord): boolean {
	if (!record.finished || record.failedText) {
		return false;
	}

	if (record.bodyPath || record.bodyCaptureError) {
		return false;
	}

	if (!record.url || record.url.startsWith("data:") || record.url.startsWith("blob:")) {
		return false;
	}

	if (
		record.statusCode === 101 ||
		record.statusCode === 204 ||
		record.statusCode === 205 ||
		record.statusCode === 304
	) {
		return false;
	}

	if (record.resourceType === "WebSocket" || record.resourceType === "EventSource") {
		return false;
	}

	return true;
}

function extensionForMimeType(mimeType: string | undefined): string {
	switch (mimeType) {
		case "application/javascript":
		case "application/x-javascript":
		case "text/javascript":
			return ".js";
		case "application/json":
		case "text/json":
			return ".json";
		case "application/wasm":
			return ".wasm";
		case "font/otf":
			return ".otf";
		case "font/ttf":
			return ".ttf";
		case "font/woff":
		case "application/font-woff":
			return ".woff";
		case "font/woff2":
			return ".woff2";
		case "image/avif":
			return ".avif";
		case "image/gif":
			return ".gif";
		case "image/jpeg":
			return ".jpg";
		case "image/png":
			return ".png";
		case "image/svg+xml":
			return ".svg";
		case "image/webp":
			return ".webp";
		case "model/gltf+json":
			return ".gltf";
		case "model/gltf-binary":
			return ".glb";
		case "text/css":
			return ".css";
		case "text/html":
			return ".html";
		case "video/mp4":
			return ".mp4";
		case "audio/mpeg":
			return ".mp3";
		case "audio/ogg":
			return ".ogg";
		default:
			return "";
	}
}

function buildResourcePath(urlValue: string, mimeType: string | undefined): string {
	const hash = shortHash(urlValue);

	try {
		const url = new URL(urlValue);
		const pathnameSegments = url.pathname
			.split("/")
			.filter(Boolean)
			.map((segment) => sanitizeSegment(segment));
		const host = sanitizeSegment(url.host);
		const fileStem = pathnameSegments.pop() ?? "index";
		const currentExtension = extname(fileStem);
		const inferredExtension =
			currentExtension || extensionForMimeType(mimeType) || ".bin";
		const fileNameStem = currentExtension
			? fileStem.slice(0, fileStem.length - currentExtension.length)
			: fileStem;
		const fileName = `${fileNameStem}--${hash}${inferredExtension}`;

		return join("resources", host, ...pathnameSegments, fileName);
	} catch {
		return join("resources", "unknown", `${hash}${extensionForMimeType(mimeType) || ".bin"}`);
	}
}

async function createTarget(endpoint: string, url: string): Promise<PageTarget> {
	const response = await fetch(
		`${normalizeEndpoint(endpoint)}/json/new?${encodeURIComponent(url)}`,
		{
			method: "PUT",
		},
	);

	if (!response.ok) {
		throw new Error(
			`Could not open a new DevTools target for ${url}. ${response.status}`,
		);
	}

	const payload = await response.json();
	const target = parsePageTarget(payload);
	if (!target) {
		throw new Error("Chrome returned malformed target metadata for /json/new.");
	}

	return target;
}

async function listTargets(endpoint: string): Promise<readonly PageTarget[]> {
	const payload = await getJson(`${normalizeEndpoint(endpoint)}/json/list`);
	if (!Array.isArray(payload)) {
		throw new Error("Chrome did not return a target array from /json/list.");
	}

	const targets: PageTarget[] = [];

	for (const item of payload) {
		const target = parsePageTarget(item);
		if (target) {
			targets.push(target);
		}
	}

	return targets;
}

async function waitForNetworkIdle(
	state: CaptureState,
	idleMs: number,
	timeoutMs: number,
): Promise<void> {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const isIdle =
			state.inflightRequestIds.size === 0 &&
			Date.now() - state.lastNetworkActivityAt >= idleMs;

		if (isIdle) {
			return;
		}

		await sleep(200);
	}

	console.warn(
		`Network never went idle for ${idleMs}ms within ${timeoutMs}ms; finalizing capture anyway.`,
	);
}

async function waitForPageLoad(
	client: DevtoolsClient,
	timeoutMs: number,
): Promise<boolean> {
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			resolve(false);
		}, timeoutMs);

		const unsubscribe = client.onEvent("Page.loadEventFired", () => {
			clearTimeout(timeout);
			unsubscribe();
			resolve(true);
		});
	});
}

void main().catch((error: unknown) => {
	console.error(getErrorMessage(error));
	process.exitCode = 1;
});
