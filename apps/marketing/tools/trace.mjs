import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const parseArguments = (arguments_) => {
	const options = {};
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument.startsWith("--"))
			options[argument.slice(2)] = arguments_[++index];
	}
	return options;
};

export const recordTrace = async ({
	url,
	rootSelector = "body",
	actions = [],
	width = 1280,
	height = 800,
}) => {
	const session = await createBrowserSession({ url, width, height, dpr: 1 });
	try {
		const frame = (await session.frameTree())[0];
		await session.evaluate(
			`(() => {
				const root = document.querySelector(${JSON.stringify(rootSelector)});
				if (!root) throw new Error("Trace root not found");
				const startedAt = performance.now();
				window.__opalineTrace = [];
				const pathFor = (node) => {
					const parts = [];
					let current = node;
					while (current && current !== root.parentElement) {
						const siblings = current.parentElement ? [...current.parentElement.children] : [current];
						parts.push(current.tagName.toLowerCase() + "[" + siblings.indexOf(current) + "]");
						current = current.parentElement;
					}
					return parts.reverse().join("/");
				};
				window.__opalineTraceObserver = new MutationObserver((records) => {
					for (const record of records) {
						window.__opalineTrace.push({
							t: Number((performance.now() - startedAt).toFixed(2)),
							path: pathFor(record.target),
							attribute: record.attributeName,
							oldValue: record.oldValue,
							value: record.attributeName ? record.target.getAttribute(record.attributeName) : null,
							style: record.target instanceof Element ? record.target.getAttribute("style") : null,
						});
					}
				});
				window.__opalineTraceObserver.observe(root, {
					attributes: true,
					attributeOldValue: true,
					subtree: true,
				});
			})()`,
			{ frameId: frame.id },
		);

		for (const action of actions) {
			if (action.type === "wait") await wait(action.duration);
			else if (action.type === "key") {
				for (const type of ["keyDown", "keyUp"]) {
					await session.client.call("Input.dispatchKeyEvent", {
						type,
						key: action.key,
						code: action.code ?? action.key,
					});
				}
			} else if (["move", "click"].includes(action.type)) {
				const rect = await session.evaluate(
					`(() => {
						const node = document.querySelector(${JSON.stringify(action.selector)});
						if (!node) throw new Error("Action target not found");
						const rect = node.getBoundingClientRect();
						return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
					})()`,
					{ frameId: frame.id },
				);
				const x = rect.x + rect.width / 2;
				const y = rect.y + rect.height / 2;
				await session.client.call("Input.dispatchMouseEvent", {
					type: "mouseMoved",
					x,
					y,
				});
				if (action.type === "click") {
					await session.client.call("Input.dispatchMouseEvent", {
						type: "mousePressed",
						x,
						y,
						button: "left",
						buttons: 1,
						clickCount: 1,
					});
					await session.client.call("Input.dispatchMouseEvent", {
						type: "mouseReleased",
						x,
						y,
						button: "left",
						buttons: 0,
						clickCount: 1,
					});
				}
			}
		}

		await wait(250);
		return await session.evaluate(
			`(() => {
				window.__opalineTraceObserver?.disconnect();
				return window.__opalineTrace;
			})()`,
			{ frameId: frame.id },
		);
	} finally {
		await session.close();
	}
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const options = parseArguments(process.argv.slice(2));
	if (!options.url || !options.scenario || !options.output) {
		throw new Error(
			"Usage: node tools/trace.mjs --url <url> --scenario <scenario.json> --output <trace.json>",
		);
	}
	const scenario = JSON.parse(await readFile(options.scenario, "utf8"));
	const trace = await recordTrace({ url: options.url, ...scenario });
	const outputPath = path.resolve(options.output);
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(trace, null, 2)}\n`);
	console.log(
		JSON.stringify({ output: outputPath, mutations: trace.length }, null, 2),
	);
}
