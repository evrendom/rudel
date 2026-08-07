import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const chromeOrigin = process.env.CHROME_DEBUG_ORIGIN ?? "http://127.0.0.1:9254";
const referenceUrl =
	process.env.OPALINE_REFERENCE_URL ??
	"http://127.0.0.1:4180/lens-attio-lens-aperture";
const candidateUrl =
	process.env.OPALINE_CANDIDATE_URL ?? "http://127.0.0.1:4321/";
const outputDirectory = new URL(
	"../../../.context/visual-diff/",
	import.meta.url,
);
const settledReferenceDirectory = new URL(
	"../../../.context/reference-shots/",
	import.meta.url,
);
const assertVisuals = process.env.VISUAL_ASSERT === "1";
const minimumSsim = Number(process.env.MINIMUM_SSIM ?? "0.6");
const settledReferenceOnly = process.env.SETTLED_REFERENCE_ONLY === "1";

const cases = [
	{ name: "desktop-top", width: 1280, height: 800, scrollY: 0 },
	{ name: "desktop-hero-focus", width: 1280, height: 800, scrollY: 500 },
	{ name: "desktop-hero-end", width: 1280, height: 800, scrollY: 1180 },
	{ name: "phone-top", width: 390, height: 844, scrollY: 0 },
	{ name: "phone-hero-focus", width: 390, height: 844, scrollY: 500 },
];

await mkdir(outputDirectory, { recursive: true });

const createTarget = async (url) => {
	const response = await fetch(
		`${chromeOrigin}/json/new?${encodeURIComponent(url)}`,
		{ method: "PUT" },
	);
	if (!response.ok) throw new Error(`Chrome target failed: ${response.status}`);
	return response.json();
};

const findOrCreateTarget = async (url) => {
	const targets = await fetch(`${chromeOrigin}/json/list`).then((result) =>
		result.json(),
	);
	const existing = targets.find(
		(target) => target.type === "page" && target.url === url,
	);
	return existing
		? { target: existing, owned: false }
		: { target: await createTarget(url), owned: true };
};

const connect = async (webSocketDebuggerUrl) => {
	const socket = new WebSocket(webSocketDebuggerUrl);
	let requestId = 0;
	const pending = new Map();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		if (!message.id || !pending.has(message.id)) return;
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) request.reject(new Error(message.error.message));
		else request.resolve(message.result);
	});
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", reject, { once: true });
	});
	return {
		call(method, params = {}) {
			return new Promise((resolve, reject) => {
				const id = ++requestId;
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ id, method, params }));
			});
		},
		close() {
			socket.close();
		},
	};
};

const wait = (duration) =>
	new Promise((resolve) => setTimeout(resolve, duration));
const waitForRuntime = async (client, expression, timeout = 15000) => {
	const startedAt = Date.now();
	while (true) {
		const evaluation = await client.call("Runtime.evaluate", {
			expression,
			returnByValue: true,
		});
		if (evaluation.result.value) return;
		if (Date.now() - startedAt > timeout) {
			throw new Error(`Timed out waiting for settled reference: ${expression}`);
		}
		await wait(100);
	}
};

const capture = async ({ client, kind, testCase }) => {
	if (kind === "reference" && settledReferenceOnly) {
		return new URL(`${testCase.name}.png`, settledReferenceDirectory);
	}
	await client.call("Emulation.setDeviceMetricsOverride", {
		width: testCase.width,
		height: testCase.height,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await client.call("Page.reload", { ignoreCache: true });
	try {
		await waitForRuntime(
			client,
			kind === "reference"
				? `(() => {
					const doc = document.querySelector("iframe")?.contentDocument;
					const title = doc?.querySelector("#lens-attio-title-source");
					return Boolean(title && title.getBoundingClientRect().height > 100);
				})()`
				: 'document.documentElement.dataset.aperture === "idle" || document.documentElement.dataset.aperture === "released"',
			kind === "reference" ? 8000 : 4000,
		);
	} catch (error) {
		if (kind !== "reference") throw error;
		console.warn(
			`${testCase.name}: live reference hit a known composition race; using its settled Phase 0 capture`,
		);
		return new URL(`${testCase.name}.png`, settledReferenceDirectory);
	}
	await client.call("Runtime.evaluate", {
		expression:
			'window.dispatchEvent(new WheelEvent("wheel", { deltaY: 2400, cancelable: true }))',
	});
	await wait(kind === "reference" ? 1500 : 400);
	await client.call("Runtime.evaluate", {
		expression:
			kind === "reference"
				? `document.querySelector("iframe").contentWindow.scrollTo(0, ${testCase.scrollY})`
				: `scrollTo(0, ${testCase.scrollY})`,
	});
	await wait(150);
	const screenshot = await client.call("Page.captureScreenshot", {
		format: "png",
		fromSurface: true,
		captureBeyondViewport: false,
	});
	const path = new URL(`${testCase.name}-${kind}.png`, outputDirectory);
	await writeFile(path, screenshot.data, "base64");
	return path;
};

const referenceHandle = await findOrCreateTarget(referenceUrl);
const candidateHandle = await findOrCreateTarget(candidateUrl);
const referenceTarget = referenceHandle.target;
const candidateTarget = candidateHandle.target;
const referenceClient = await connect(referenceTarget.webSocketDebuggerUrl);
const candidateClient = await connect(candidateTarget.webSocketDebuggerUrl);
await referenceClient.call("Page.enable");
await candidateClient.call("Page.enable");
const report = [];

try {
	for (const testCase of cases) {
		const reference = await capture({
			client: referenceClient,
			kind: "reference",
			testCase,
		});
		const candidate = await capture({
			client: candidateClient,
			kind: "candidate",
			testCase,
		});
		const comparison = spawnSync(
			"ffmpeg",
			[
				"-hide_banner",
				"-i",
				reference.pathname,
				"-i",
				candidate.pathname,
				"-lavfi",
				"ssim",
				"-f",
				"null",
				"-",
			],
			{ encoding: "utf8" },
		);
		const output = `${comparison.stdout}\n${comparison.stderr}`;
		const score = Number(output.match(/All:([0-9.]+)/)?.[1] ?? "0");
		report.push({ case: testCase.name, ssim: score });
		console.log(`${testCase.name}: SSIM ${score.toFixed(4)}`);
		if (assertVisuals && score < minimumSsim) {
			throw new Error(
				`${testCase.name} scored ${score.toFixed(4)} below ${minimumSsim}`,
			);
		}
	}
} finally {
	referenceClient.close();
	candidateClient.close();
	if (referenceHandle.owned) {
		await fetch(`${chromeOrigin}/json/close/${referenceTarget.id}`);
	}
	if (candidateHandle.owned) {
		await fetch(`${chromeOrigin}/json/close/${candidateTarget.id}`);
	}
}

await writeFile(
	new URL("report.json", outputDirectory),
	`${JSON.stringify(report, null, 2)}\n`,
);
