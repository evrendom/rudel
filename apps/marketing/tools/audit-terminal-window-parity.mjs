import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { createBrowserSession, wait } from "./driver.mjs";

const mode = process.env.OPALINE_TERMINAL_AUDIT_MODE ?? "before";
const outputRoot = path.resolve(
	`.context/extractions/dashboard/terminal-window-parity/${mode}`,
);
const gateRoot = path.resolve(
	`.context/gates/dashboard/terminal-window-parity/${mode}`,
);
const sourceUrl = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const candidateUrl = "http://127.0.0.1:4321/";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const windowIds = ["call", "slack", "terminal"];
const sourceSelector = (id) =>
	`[data-home-hero="desktop-window"][data-home-hero-app="${id}"]`;
const candidateSelector = (id) =>
	`[data-opaline-dashboard-part="desktop-window"][data-opaline-dashboard-app="${id}"]`;
const program = JSON.parse(
	await readFile(
		path.resolve(".context/extractions/dashboard/ambient/program/program.json"),
		"utf8",
	),
);

const clamp = (value, minimum = 0, maximum = 1) =>
	Math.min(maximum, Math.max(minimum, value));

const cubicCoordinate = (time, first, second) => {
	const inverse = 1 - time;
	return (
		3 * inverse * inverse * time * first +
		3 * inverse * time * time * second +
		time * time * time
	);
};

const cubicBezier = (progress, x1, y1, x2, y2) => {
	const target = clamp(progress);
	if (target === 0) return 0;
	if (target === 1) return 1;
	let lower = 0;
	let upper = 1;
	for (let iteration = 0; iteration < 18; iteration += 1) {
		const midpoint = (lower + upper) / 2;
		if (cubicCoordinate(midpoint, x1, x2) < target) lower = midpoint;
		else upper = midpoint;
	}
	return cubicCoordinate((lower + upper) / 2, y1, y2);
};

const easeOut = (progress) => cubicBezier(progress, 0, 0, 0.58, 1);

const parseChurned = (value) => {
	const minutes = Number(value.match(/(\d+)m/)?.[1] ?? 0);
	const seconds = Number(value.match(/(\d+)s/)?.[1] ?? 0);
	const tokens = Number(value.match(/↓\s*(\d+)k/)?.[1] ?? 0);
	return { seconds: minutes * 60 + seconds, tokens };
};

const typeCount = (elapsed, length, speed) =>
	clamp(Math.floor(Math.max(0, elapsed) / speed), 0, length);

const terminalExpectedAt = (elapsed) => {
	const terminal = program.terminal;
	const cycleDuration = terminal.exchangeDuration * terminal.exchanges.length;
	const normalized =
		((elapsed % cycleDuration) + cycleDuration) % cycleDuration;
	const exchangeIndex = Math.floor(normalized / terminal.exchangeDuration);
	const exchange = terminal.exchanges[exchangeIndex];
	const local = normalized % terminal.exchangeDuration;
	const typingEnd = exchange.prompt.length * terminal.typeSpeed;
	const thinkingStart = typingEnd + terminal.typedPause;
	const respondingStart = thinkingStart + terminal.thinkingDuration;
	const phase =
		local < typingEnd
			? "typing"
			: local < thinkingStart
				? "typed"
				: local < respondingStart
					? "thinking"
					: "responding";
	const state = {
		exchangeIndex,
		phase,
		promptText: "",
		responsePrompt: "",
		ranText: "",
		commands: [],
		commandSources: exchange.commands,
		answer: "",
		answerSource: exchange.answer,
		tokenIcon: "",
		tokenLabel: "",
		cursorOpacity: 0,
	};
	if (phase === "typing" || phase === "typed") {
		state.promptText = exchange.prompt.slice(
			0,
			phase === "typed"
				? exchange.prompt.length
				: typeCount(local, exchange.prompt.length, terminal.typeSpeed),
		);
		if (
			phase === "typing" &&
			state.promptText.length < exchange.prompt.length
		) {
			const cursorElapsed = local % terminal.cursorAnimation.duration;
			const progress = clamp(cursorElapsed / terminal.cursorAnimation.duration);
			state.cursorOpacity = 1 - easeOut(progress);
		}
		return state;
	}
	state.responsePrompt = exchange.prompt;
	const churnElapsed = Math.max(0, local - thinkingStart);
	const churnStep = Math.min(
		terminal.churnDuration,
		Math.floor(churnElapsed / terminal.churnTick) * terminal.churnTick,
	);
	if (phase === "thinking") {
		const target = parseChurned(exchange.churned);
		const progress = clamp(churnStep / terminal.churnDuration);
		state.tokenIcon =
			terminal.spinnerFrames[
				Math.floor(churnStep / terminal.churnTick) %
					terminal.spinnerFrames.length
			];
		state.tokenLabel = `Churning… (${Math.max(1, Math.round(target.seconds * progress))}s · ↓ ${Math.max(1, Math.round(target.tokens * progress))}k tokens)`;
		return state;
	}
	state.tokenIcon = "·";
	state.tokenLabel = `Churned (${exchange.churned})`;
	const responseElapsed = local - respondingStart;
	const ranLabel = `Ran ${exchange.commands.length} commands`;
	const ranElapsed = responseElapsed - terminal.responseStartDelay;
	state.ranText = ranLabel.slice(
		0,
		typeCount(ranElapsed, ranLabel.length, terminal.typeSpeed),
	);
	let commandElapsed = ranElapsed - ranLabel.length * terminal.typeSpeed;
	let completedCommands = 0;
	for (const command of exchange.commands) {
		const characters = typeCount(
			commandElapsed,
			command.length,
			terminal.commandTypeSpeed,
		);
		if (commandElapsed > 0) state.commands.push(command.slice(0, characters));
		if (characters >= command.length) completedCommands += 1;
		commandElapsed -= command.length * terminal.commandTypeSpeed;
	}
	if (completedCommands === exchange.commands.length) {
		state.answer = exchange.answer.slice(
			0,
			typeCount(
				Math.max(0, commandElapsed),
				exchange.answer.length,
				terminal.typeSpeed,
			),
		);
	}
	return state;
};

const terminalEventTimes = () => {
	const times = new Set([0]);
	for (const [
		exchangeIndex,
		exchange,
	] of program.terminal.exchanges.entries()) {
		const base = exchangeIndex * program.terminal.exchangeDuration;
		const typingEnd = exchange.prompt.length * program.terminal.typeSpeed;
		for (let index = 1; index <= exchange.prompt.length; index += 1) {
			times.add(base + index * program.terminal.typeSpeed);
		}
		const thinkingStart = typingEnd + program.terminal.typedPause;
		times.add(base + thinkingStart);
		for (
			let elapsed = program.terminal.churnTick;
			elapsed <= program.terminal.churnDuration;
			elapsed += program.terminal.churnTick
		) {
			times.add(base + thinkingStart + elapsed);
		}
		const respondingStart = thinkingStart + program.terminal.thinkingDuration;
		times.add(base + respondingStart);
		const ranLabel = `Ran ${exchange.commands.length} commands`;
		let responseTime = respondingStart + program.terminal.responseStartDelay;
		for (let index = 1; index <= ranLabel.length; index += 1) {
			times.add(base + responseTime + index * program.terminal.typeSpeed);
		}
		responseTime += ranLabel.length * program.terminal.typeSpeed;
		for (const command of exchange.commands) {
			for (let index = 1; index <= command.length; index += 1) {
				times.add(
					base + responseTime + index * program.terminal.commandTypeSpeed,
				);
			}
			responseTime += command.length * program.terminal.commandTypeSpeed;
		}
		for (let index = 1; index <= exchange.answer.length; index += 1) {
			times.add(base + responseTime + index * program.terminal.typeSpeed);
		}
		times.add(base + program.terminal.exchangeDuration);
	}
	return [...times].toSorted((left, right) => left - right);
};

const seekExpression = (terminalMs) => `(() => {
	const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
	Object.assign(control.dataset, {
		outerMs: '2500', revealMs: '1000', tableMs: '3400', terminalMs: ${JSON.stringify(String(terminalMs))},
	});
	control.dispatchEvent(new Event('opaline:ambient-seek'));
})()`;

const sourceControllerExpression = `(() => {
	const windowElement = document.querySelector(${JSON.stringify(sourceSelector("terminal"))});
	if (!(windowElement instanceof HTMLElement)) throw new Error('source terminal missing');
	const clone = windowElement.cloneNode(true);
	windowElement.replaceWith(clone);
	const content = [...clone.querySelectorAll('div')].find((element) =>
		element.classList.contains('bg-black-50') && element.classList.contains('font-mono')
	);
	const body = content?.children[0];
	const responseGrid = body?.children[0];
	const tokenRow = body?.children[1];
	const promptGrid = body?.children[2];
	const cloneElement = (element) => element instanceof HTMLElement ? element.cloneNode(true) : null;
	const scaffold = responseGrid?.firstElementChild?.firstElementChild;
	const templates = {
		prompt: cloneElement(scaffold?.children[0]),
		commands: cloneElement(scaffold?.children[1]),
		answer: cloneElement(scaffold?.children[2]),
		token: cloneElement(tokenRow?.querySelector('p')),
		liveResponseClass: responseGrid?.children[1]?.className ?? '[grid-area:1/1]',
		livePrompt: cloneElement(promptGrid?.children[1]),
		promptText: cloneElement(promptGrid?.firstElementChild?.children[1]),
		cursor: cloneElement(clone.querySelector('span[aria-hidden="true"].ml-px')),
	};
	if (!content || !responseGrid || !tokenRow || !promptGrid || Object.values(templates).some((value, index) => index !== 5 && !value)) {
		throw new Error('source terminal templates missing');
	}
	document.querySelector('template[data-opaline-terminal-audit-templates]')?.remove();
	const template = document.createElement('template');
	template.dataset.opalineTerminalAuditTemplates = '';
	template.dataset.liveResponseClass = templates.liveResponseClass;
	const container = document.createElement('div');
	for (const [slot, value] of Object.entries(templates)) {
		if (!(value instanceof HTMLElement)) continue;
		value.dataset.opalineTerminalAuditSlot = slot;
		container.append(value);
	}
	template.content.append(container);
	document.body.append(template);
})()`;

const sourceRenderExpression = (state) => `(() => {
	const state = ${JSON.stringify(state)};
	const windowElement = document.querySelector(${JSON.stringify(sourceSelector("terminal"))});
	const content = [...windowElement.querySelectorAll('div')].find((element) =>
		element.classList.contains('bg-black-50') && element.classList.contains('font-mono')
	);
	const body = content.children[0];
	const responseGrid = body.children[0];
	const tokenRow = body.children[1];
	const promptGrid = body.children[2];
	const template = document.querySelector('template[data-opaline-terminal-audit-templates]');
	const container = template.content.firstElementChild;
	const get = (slot) => {
		const clone = container.querySelector('[data-opaline-terminal-audit-slot="' + slot + '"]').cloneNode(true);
		clone.removeAttribute('data-opaline-terminal-audit-slot');
		return clone;
	};
	const setTextAfterFirstChild = (element, text) => {
		const first = element.firstElementChild;
		if (!first) element.textContent = text;
		else element.replaceChildren(first, document.createTextNode(text));
	};
	const livePrompt = get('livePrompt');
	let promptText = livePrompt.children[1];
	if (!(promptText instanceof HTMLElement)) {
		promptText = get('promptText');
		livePrompt.append(promptText);
	}
	promptText.textContent = state.promptText;
	if (state.phase === 'typing') {
		const cursor = get('cursor');
		cursor.style.opacity = String(state.cursorOpacity);
		promptText.append(cursor);
	}
	promptGrid.children[1]?.replaceWith(livePrompt);
	responseGrid.children[1]?.remove();
	if (state.responsePrompt) {
		const response = document.createElement('div');
		response.className = template.dataset.liveResponseClass;
		const responseBody = document.createElement('div');
		responseBody.className = responseGrid.firstElementChild.firstElementChild.className;
		const prompt = get('prompt');
		prompt.children[1].textContent = state.responsePrompt;
		responseBody.append(prompt);
		if (state.phase === 'responding') {
			const commands = get('commands');
			setTextAfterFirstChild(commands.children[0], state.ranText);
			while (commands.children.length > 1) commands.lastElementChild.remove();
			const commandsTemplate = container.querySelector('[data-opaline-terminal-audit-slot="commands"]');
			for (let index = 0; index < state.commands.length; index += 1) {
				const sourceRow = commandsTemplate.children[Math.min(index + 1, commandsTemplate.children.length - 1)];
				const row = sourceRow.cloneNode(true);
				row.textContent = '⎿ ' + state.commands[index];
				commands.append(row);
			}
			responseBody.append(commands);
			if (state.answer) {
				const answer = get('answer');
				answer.children[1].children[0].textContent = state.answerSource;
				answer.children[1].children[1].textContent = state.answer;
				responseBody.append(answer);
			}
		}
		response.append(responseBody);
		responseGrid.append(response);
	}
	tokenRow.replaceChildren();
	if (state.tokenLabel) {
		const token = get('token');
		token.children[0].textContent = state.tokenIcon;
		token.children[1].textContent = state.tokenLabel;
		if (state.phase === 'thinking') token.className = token.className.replace('text-black-700', 'text-[#D97757]');
		else token.className = token.className.replace('text-[#D97757]', 'text-black-700');
		tokenRow.append(token);
	}
})()`;

const terminalMapperExpression = (selector) => `(() => {
	const windowElement = document.querySelector(${JSON.stringify(selector)});
	const content = [...windowElement.querySelectorAll('div')].find((element) =>
		element.classList.contains('bg-black-50') && element.classList.contains('font-mono')
	);
	const body = content.children[0];
	const responseGrid = body.children[0];
	const tokenRow = body.children[1];
	const promptGrid = body.children[2];
	const response = responseGrid.children[1];
	const responseBody = response?.firstElementChild;
	const commandsGroup = responseBody?.children[1];
	return {
		promptText: promptGrid.children[1]?.children[1]?.childNodes[0]?.textContent ?? '',
		responsePrompt: responseBody?.children[0]?.children[1]?.textContent ?? '',
		ranText: commandsGroup?.children[0]?.textContent?.replace(/^●/, '') ?? '',
		commands: commandsGroup ? [...commandsGroup.children].slice(1).map((row) => row.textContent?.replace(/^⎿ /, '') ?? '') : [],
		answer: responseBody?.children[2]?.children[1]?.children[1]?.textContent ?? '',
		tokenIcon: tokenRow.firstElementChild?.children[0]?.textContent ?? '',
		tokenLabel: tokenRow.firstElementChild?.children[1]?.textContent ?? '',
		cursor: promptGrid.children[1]?.querySelector('span[aria-hidden="true"].ml-px') ? {
			opacity: getComputedStyle(promptGrid.children[1].querySelector('span[aria-hidden="true"].ml-px')).opacity,
			width: getComputedStyle(promptGrid.children[1].querySelector('span[aria-hidden="true"].ml-px')).width,
			height: getComputedStyle(promptGrid.children[1].querySelector('span[aria-hidden="true"].ml-px')).height,
			backgroundColor: getComputedStyle(promptGrid.children[1].querySelector('span[aria-hidden="true"].ml-px')).backgroundColor,
		} : null,
	};
})()`;

const stableAuditBackground = `(() => {
	document.documentElement.style.setProperty('background', '#fff', 'important');
	document.body.style.setProperty('background', '#fff', 'important');
	for (const canvas of document.querySelectorAll('canvas')) canvas.style.visibility = 'hidden';
})()`;

const snapshotExpression = (selector, properties) => `(() => {
	const root = document.querySelector(${JSON.stringify(selector)});
	if (!(root instanceof HTMLElement)) throw new Error('snapshot root missing');
	const properties = ${JSON.stringify(properties)};
	const rootRect = root.getBoundingClientRect();
	const round = (value) => Number(Number(value).toFixed(4));
		const visibleOverlay = root.querySelector('[data-opaline-claude-code]');
		const elements = visibleOverlay
			? [root, visibleOverlay, ...visibleOverlay.querySelectorAll('*')]
			: [root, ...root.querySelectorAll('*')];
	const pathFor = (element) => {
		if (element === root) return '0';
		const segments = [];
		let current = element;
		while (current && current !== root) {
			const parent = current.parentElement;
			if (!parent) break;
			segments.push([...parent.children].indexOf(current));
			current = parent;
		}
		return '0.' + segments.reverse().join('.');
	};
	return {
		propertyCount: properties.length,
		nodes: elements.map((element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return {
				path: pathFor(element),
				tag: element.tagName.toLowerCase(),
				attributes: Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value])),
				directText: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join(''),
				bounds: {
					x: round(rect.x - rootRect.x), y: round(rect.y - rootRect.y),
					width: round(rect.width), height: round(rect.height),
				},
				styles: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
			};
		}),
	};
})()`;

const normalizeAttributes = (attributes) => {
	const normalized = {};
	for (const [key, value] of Object.entries(attributes)) {
		const normalizedKey =
			key === "data-opaline-dashboard-part"
				? "data-home-hero"
				: key === "data-opaline-dashboard-app"
					? "data-home-hero-app"
					: key;
		normalized[normalizedKey] = value;
	}
	return normalized;
};

const compareSnapshots = (source, candidate, state) => {
	const sourceByPath = new Map(source.nodes.map((node) => [node.path, node]));
	const candidateByPath = new Map(
		candidate.nodes.map((node) => [node.path, node]),
	);
	const differences = [];
	for (const pathValue of new Set([
		...sourceByPath.keys(),
		...candidateByPath.keys(),
	])) {
		const left = sourceByPath.get(pathValue);
		const right = candidateByPath.get(pathValue);
		if (!left || !right) {
			differences.push({
				type: "node",
				path: pathValue,
				source: left?.tag ?? null,
				candidate: right?.tag ?? null,
			});
			continue;
		}
		if (left.tag !== right.tag)
			differences.push({
				type: "tag",
				path: pathValue,
				source: left.tag,
				candidate: right.tag,
			});
		if (left.directText !== right.directText)
			differences.push({
				type: "text",
				path: pathValue,
				source: left.directText,
				candidate: right.directText,
			});
		const leftAttributes = normalizeAttributes(left.attributes);
		const rightAttributes = normalizeAttributes(right.attributes);
		for (const key of new Set([
			...Object.keys(leftAttributes),
			...Object.keys(rightAttributes),
		])) {
			if (leftAttributes[key] !== rightAttributes[key])
				differences.push({
					type: "attribute",
					path: pathValue,
					property: key,
					source: leftAttributes[key] ?? null,
					candidate: rightAttributes[key] ?? null,
				});
		}
		for (const property of ["x", "y", "width", "height"]) {
			if (Math.abs(left.bounds[property] - right.bounds[property]) > 0.01)
				differences.push({
					type: "geometry",
					path: pathValue,
					property,
					source: left.bounds[property],
					candidate: right.bounds[property],
				});
		}
		for (const property of Object.keys(left.styles)) {
			if (left.styles[property] !== right.styles[property])
				differences.push({
					type: "style",
					path: pathValue,
					property,
					source: left.styles[property],
					candidate: right.styles[property],
				});
		}
	}
	return {
		state,
		propertyCount: source.propertyCount,
		sourceNodeCount: source.nodes.length,
		candidateNodeCount: candidate.nodes.length,
		differences,
	};
};

const digest = (value) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");

const captureClip = async (session, rect, pageOffset) => {
	const documentX = rect.x + pageOffset.x;
	const documentY = rect.y + pageOffset.y;
	const clip = {
		x: Math.max(0, Math.floor(documentX)),
		y: Math.max(0, Math.floor(documentY)),
		width: Math.max(
			1,
			Math.ceil(documentX + rect.width) - Math.max(0, Math.floor(documentX)),
		),
		height: Math.max(
			1,
			Math.ceil(documentY + rect.height) - Math.max(0, Math.floor(documentY)),
		),
		scale: 1,
	};
	const result = await session.client.call("Page.captureScreenshot", {
		format: "png",
		fromSurface: true,
		captureBeyondViewport: false,
		clip,
	});
	return { buffer: Buffer.from(result.data, "base64"), clip };
};

const compareBuffers = (sourceBuffer, candidateBuffer) => {
	const source = PNG.sync.read(sourceBuffer);
	const candidate = PNG.sync.read(candidateBuffer);
	const width = Math.min(source.width, candidate.width);
	const height = Math.min(source.height, candidate.height);
	const left = new PNG({ width, height });
	const right = new PNG({ width, height });
	PNG.bitblt(source, left, 0, 0, width, height, 0, 0);
	PNG.bitblt(candidate, right, 0, 0, width, height, 0, 0);
	const diff = new PNG({ width, height });
	const differingPixels = pixelmatch(
		left.data,
		right.data,
		diff.data,
		width,
		height,
		{
			threshold: 0.1,
			includeAA: false,
		},
	);
	return {
		width,
		height,
		differingPixels,
		diffPercent: (differingPixels / (width * height)) * 100,
		diffBuffer: PNG.sync.write(diff),
	};
};

const saveCropPair = async (name, sourceCapture, candidateCapture) => {
	const comparison = compareBuffers(
		sourceCapture.buffer,
		candidateCapture.buffer,
	);
	const sourcePath = path.join(outputRoot, "crops", `${name}-source.png`);
	const candidatePath = path.join(outputRoot, "crops", `${name}-candidate.png`);
	const diffPath = path.join(outputRoot, "crops", `${name}-diff.png`);
	await Promise.all([
		writeFile(sourcePath, sourceCapture.buffer),
		writeFile(candidatePath, candidateCapture.buffer),
		writeFile(diffPath, comparison.diffBuffer),
	]);
	return {
		name,
		sourcePath,
		candidatePath,
		diffPath,
		sourceClip: sourceCapture.clip,
		candidateClip: candidateCapture.clip,
		pixel: {
			width: comparison.width,
			height: comparison.height,
			differingPixels: comparison.differingPixels,
			diffPercent: comparison.diffPercent,
		},
	};
};

const rectFor = (session, selector, frameId) =>
	session.evaluate(
		`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
		{ frameId },
	);

const prepareSource = async () => {
	const session = await createBrowserSession({ url: sourceUrl, ...viewport });
	await session.completeAperture(1);
	const frame = (await session.frameTree()).find((candidate) =>
		candidate.url.includes("opaline-composition=lens-attio-lens"),
	);
	if (!frame) throw new Error("source composition frame missing");
	await session.waitFor(
		'document.querySelectorAll("[data-home-hero=desktop-window]").length === 3',
		{ frameId: frame.id },
	);
	await session.scrollTo(500);
	await wait(2_600);
	await session.evaluate(stableAuditBackground, { frameId: frame.id });
	await session.evaluate(sourceControllerExpression, { frameId: frame.id });
	await session.evaluate("document.fonts.ready", {
		frameId: frame.id,
		awaitPromise: true,
	});
	const pageOffset = await session.evaluate(
		"({ x: window.scrollX, y: window.scrollY })",
	);
	return { session, frameId: frame.id, pageOffset };
};

const prepareCandidate = async () => {
	const session = await createBrowserSession({
		url: candidateUrl,
		...viewport,
	});
	await session.completeAperture(1);
	await session.waitFor(
		'document.querySelector("[data-opaline-dashboard-ambient-control]")?.hasAttribute("data-opaline-ambient-ready")',
	);
	await session.scrollTo(500);
	await session.evaluate(seekExpression(0));
	await session.evaluate(stableAuditBackground);
	await session.evaluate("document.fonts.ready", { awaitPromise: true });
	const pageOffset = await session.evaluate(
		"({ x: window.scrollX, y: window.scrollY })",
	);
	return { session, frameId: undefined, pageOffset };
};

const semanticExpression = (selector) => `(() => {
	const windowElement = document.querySelector(${JSON.stringify(selector)});
	const claude = windowElement.querySelector('[data-opaline-claude-code]') ?? windowElement;
	const content = [...claude.querySelectorAll('div')].find((element) => element.classList.contains('bg-black-50') && element.classList.contains('font-mono'));
	const chrome = claude.children[0];
	const lights = chrome?.querySelectorAll('span') ?? [];
	const keyboard = content?.children[1];
	const status = keyboard?.querySelector('p');
	const prompt = content?.children[0]?.children[2];
	const cursor = prompt?.querySelector('span[aria-hidden="true"].ml-px');
	const pick = (element, properties) => {
		if (!(element instanceof Element)) return null;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return {
			path: (() => { const segments=[]; let current=element; while(current && current!==windowElement){const parent=current.parentElement; if(!parent) break; segments.push([...parent.children].indexOf(current)); current=parent;} return '0.'+segments.reverse().join('.'); })(),
			className: element.getAttribute('class') ?? '',
			text: element.textContent ?? '',
			rect: { width: rect.width, height: rect.height },
			styles: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
		};
	};
	return {
		window: pick(windowElement, ['background-color','backdrop-filter','border-radius','border','box-shadow','padding','overflow','opacity','transform','transform-origin']),
		chrome: pick(chrome, ['height','padding','background-color']),
		trafficLights: [...lights].slice(0,3).map((light) => pick(light, ['width','height','border-radius','background-color'])),
		content: pick(content, ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border-radius','border','padding']),
		body: pick(content?.children[0], ['padding','gap','min-height','height']),
		promptRow: pick(prompt, ['display','grid-template-columns','padding','border','border-radius','background-color','min-height','height','color']),
		keyboardStrip: pick(keyboard, ['display','padding','border-top-color','border-top-width','background-color','height']),
		statusRow: pick(status, ['font-family','font-size','font-weight','line-height','letter-spacing','color','gap','height']),
		statusAccent: pick(status?.children[0], ['font-family','font-size','font-weight','line-height','color']),
		statusContext: pick(status?.children[1], ['font-family','font-size','font-weight','line-height','color']),
		cursor: pick(cursor, ['width','height','opacity','background-color','transform']),
		icons: {
			svgs: [...claude.querySelectorAll('svg')].map((svg) => ({
				viewBox: svg.getAttribute('viewBox'), width: getComputedStyle(svg).width,
				height: getComputedStyle(svg).height, fill: getComputedStyle(svg).fill,
				stroke: getComputedStyle(svg).stroke,
			})),
			glyphs: [...claude.querySelectorAll('span,p')]
				.map((element) => element.textContent?.trim() ?? '')
				.filter((text) => /^(>|●|⎿|▶▶ auto|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])/.test(text))
				.map((text) => ({ text, codePoints: [...text].map((character) => character.codePointAt(0).toString(16).toUpperCase()) })),
		},
	};
})()`;

await mkdir(path.join(outputRoot, "crops"), { recursive: true });
await mkdir(path.join(outputRoot, "structural"), { recursive: true });
await mkdir(gateRoot, { recursive: true });

const source = await prepareSource();
const candidate = await prepareCandidate();
let report;
try {
	const [sourceProperties, candidateProperties] = await Promise.all([
		source.session.computedStyleProperties(),
		candidate.session.computedStyleProperties(),
	]);
	if (sourceProperties.length !== 475 || candidateProperties.length !== 475) {
		throw new Error(
			`expected 475 computed properties, got ${sourceProperties.length}/${candidateProperties.length}`,
		);
	}
	if (
		JSON.stringify(sourceProperties) !== JSON.stringify(candidateProperties)
	) {
		throw new Error("source and candidate property inventories differ");
	}

	const settledTerminalMs = 8_500;
	const settledState = terminalExpectedAt(settledTerminalMs);
	await Promise.all([
		source.session.evaluate(sourceRenderExpression(settledState), {
			frameId: source.frameId,
		}),
		candidate.session.evaluate(seekExpression(settledTerminalMs)),
	]);
	const settled = [];
	for (const id of windowIds) {
		const [
			sourceSnapshot,
			candidateSnapshot,
			sourceRect,
			candidateRect,
			sourceSemantic,
			candidateSemantic,
		] = await Promise.all([
			source.session.evaluate(
				snapshotExpression(sourceSelector(id), sourceProperties),
				{ frameId: source.frameId },
			),
			candidate.session.evaluate(
				snapshotExpression(candidateSelector(id), candidateProperties),
			),
			rectFor(source.session, sourceSelector(id), source.frameId),
			rectFor(candidate.session, candidateSelector(id)),
			source.session.evaluate(semanticExpression(sourceSelector(id)), {
				frameId: source.frameId,
			}),
			candidate.session.evaluate(semanticExpression(candidateSelector(id))),
		]);
		const structural = compareSnapshots(
			sourceSnapshot,
			candidateSnapshot,
			"settled",
		);
		await Promise.all([
			writeFile(
				path.join(outputRoot, "structural", `${id}-settled-source.json`),
				`${JSON.stringify(sourceSnapshot, null, 2)}\n`,
			),
			writeFile(
				path.join(outputRoot, "structural", `${id}-settled-candidate.json`),
				`${JSON.stringify(candidateSnapshot, null, 2)}\n`,
			),
			writeFile(
				path.join(outputRoot, "structural", `${id}-settled-diff.json`),
				`${JSON.stringify(structural, null, 2)}\n`,
			),
		]);
		const [sourceCrop, candidateCrop] = await Promise.all([
			captureClip(source.session, sourceRect, source.pageOffset),
			captureClip(candidate.session, candidateRect, candidate.pageOffset),
		]);
		const crop = await saveCropPair(`${id}-settled`, sourceCrop, candidateCrop);
		settled.push({
			id,
			structural,
			semantic: { source: sourceSemantic, candidate: candidateSemantic },
			crop,
		});
	}

	const eventTimes = terminalEventTimes();
	const loopStates = [];
	const representativeIndices = new Set();
	let previousPhase = "";
	for (let index = 0; index < eventTimes.length; index += 1) {
		const elapsed = eventTimes[index];
		const expected = terminalExpectedAt(elapsed);
		if (expected.phase !== previousPhase) representativeIndices.add(index);
		previousPhase = expected.phase;
		await Promise.all([
			source.session.evaluate(sourceRenderExpression(expected), {
				frameId: source.frameId,
			}),
			candidate.session.evaluate(seekExpression(elapsed)),
		]);
		const [sourceActual, candidateActual, sourceRect, candidateRect] =
			await Promise.all([
				source.session.evaluate(
					terminalMapperExpression(sourceSelector("terminal")),
					{ frameId: source.frameId },
				),
				candidate.session.evaluate(
					terminalMapperExpression(candidateSelector("terminal")),
				),
				rectFor(source.session, sourceSelector("terminal"), source.frameId),
				rectFor(candidate.session, candidateSelector("terminal")),
			]);
		const [sourceCrop, candidateCrop] = await Promise.all([
			captureClip(source.session, sourceRect, source.pageOffset),
			captureClip(candidate.session, candidateRect, candidate.pageOffset),
		]);
		const pixel = compareBuffers(sourceCrop.buffer, candidateCrop.buffer);
		const sourceShape = {
			...sourceActual,
			cursor: sourceActual.cursor
				? {
						...sourceActual.cursor,
						opacity: Number(sourceActual.cursor.opacity).toFixed(3),
					}
				: null,
		};
		const candidateShape = {
			...candidateActual,
			cursor: candidateActual.cursor
				? {
						...candidateActual.cursor,
						opacity: Number(candidateActual.cursor.opacity).toFixed(3),
					}
				: null,
		};
		loopStates.push({
			index,
			elapsed,
			phase: expected.phase,
			exchangeIndex: expected.exchangeIndex,
			sourceHash: digest(sourceShape),
			candidateHash: digest(candidateShape),
			contentEqual:
				JSON.stringify(sourceShape) === JSON.stringify(candidateShape),
			pixel: {
				width: pixel.width,
				height: pixel.height,
				differingPixels: pixel.differingPixels,
				diffPercent: pixel.diffPercent,
			},
			staticWindowReuse: { call: "call-settled", slack: "slack-settled" },
		});
		if (representativeIndices.has(index)) {
			await saveCropPair(
				`terminal-loop-${String(index).padStart(4, "0")}-${expected.phase}`,
				sourceCrop,
				candidateCrop,
			);
		}
		if ((index + 1) % 100 === 0)
			console.log(`terminal loop crops ${index + 1}/${eventTimes.length}`);
	}

	const actionStates = [];
	// D006 intentionally raises the candidate window above the main dashboard.
	// The reference has no focus behavior, so raise the exact source window and
	// its shared auxiliary stacking layer only for the forensic crop comparison.
	// The separate product-divergence gate remains responsible for behavior.
	await source.session.evaluate(
		`(() => {
		for (const id of ${JSON.stringify(windowIds)}) {
			const element = document.querySelector((${sourceSelector.toString()})(id));
			if (!(element instanceof HTMLElement)) continue;
			element.style.zIndex = '2147483646';
			const auxiliaryLayer = element.parentElement?.parentElement;
			if (auxiliaryLayer instanceof HTMLElement) auxiliaryLayer.style.zIndex = '2147483645';
		}
	})()`,
		{ frameId: source.frameId },
	);
	const pointerPoint = async (id) =>
		candidate.session.evaluate(`(() => {
			const element = document.querySelector(${JSON.stringify(candidateSelector(id))});
			const rect = element.getBoundingClientRect();
			return { x: ${JSON.stringify(id)} === 'call' ? rect.right - 20 : rect.left + 20, y: rect.top + 24 };
		})()`);
	const dispatchPointer = (type, point, buttons) =>
		candidate.session.client.call("Input.dispatchMouseEvent", {
			type,
			...point,
			button: type === "mouseMoved" ? "none" : "left",
			buttons,
			clickCount: type === "mouseMoved" ? 0 : 1,
		});
	const candidateAssetReadiness = await candidate.session.evaluate(
		`(async () => {
		await document.fonts.ready;
		const windows = [...document.querySelectorAll('[data-opaline-dashboard-part="desktop-window"]')]
			.filter((element) => ['call', 'slack', 'terminal'].includes(element.getAttribute('data-opaline-dashboard-app')));
		return {
			jetBrainsMonoLoaded: document.fonts.check('500 10px "JetBrains Mono"'),
			windows: windows.map((windowElement) => {
				const claude = windowElement.querySelector('[data-opaline-claude-code]') ?? windowElement;
				const content = [...(claude?.querySelectorAll('div') ?? [])]
					.find((element) => element.classList.contains('bg-black-50') && element.classList.contains('font-mono'));
				const glyphs = [...(claude?.querySelectorAll('span,p') ?? [])]
					.map((element) => element.textContent?.trim() ?? '')
					.filter((text) => /^(>|●|⎿|▶▶ auto|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])/.test(text));
				const svgs = [...(claude?.querySelectorAll('svg') ?? [])];
				return {
					id: windowElement.getAttribute('data-opaline-dashboard-app'),
					fontFamily: content ? getComputedStyle(content).fontFamily : null,
					glyphs,
					svgCount: svgs.length,
					visibleSvgCount: svgs.filter((svg) => {
						const rect = svg.getBoundingClientRect();
						const style = getComputedStyle(svg);
						return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0;
					}).length,
				};
			}),
		};
	})()`,
		{ awaitPromise: true },
	);
	for (const id of windowIds) {
		const point = await pointerPoint(id);
		await dispatchPointer("mouseMoved", point, 0);
		await dispatchPointer("mousePressed", point, 1);
		const [sourceRect, candidateRect] = await Promise.all([
			rectFor(source.session, sourceSelector(id), source.frameId),
			rectFor(candidate.session, candidateSelector(id)),
		]);
		const [sourceCrop, candidateCrop] = await Promise.all([
			captureClip(source.session, sourceRect, source.pageOffset),
			captureClip(candidate.session, candidateRect, candidate.pageOffset),
		]);
		const focusCrop = await saveCropPair(
			`${id}-focused`,
			sourceCrop,
			candidateCrop,
		);
		const focusSnapshot = await candidate.session.evaluate(
			snapshotExpression(candidateSelector(id), candidateProperties),
		);
		await dispatchPointer("mouseReleased", point, 0);
		const dragStart = await pointerPoint(id);
		const delta = { x: id === "call" ? -60 : 60, y: 30 };
		await dispatchPointer("mouseMoved", dragStart, 0);
		await dispatchPointer("mousePressed", dragStart, 1);
		for (let step = 1; step <= 6; step += 1) {
			await dispatchPointer(
				"mouseMoved",
				{
					x: dragStart.x + (delta.x * step) / 6,
					y: dragStart.y + (delta.y * step) / 6,
				},
				1,
			);
			await wait(16);
		}
		await dispatchPointer(
			"mouseReleased",
			{ x: dragStart.x + delta.x, y: dragStart.y + delta.y },
			0,
		);
		await wait(50);
		const draggedRect = await rectFor(candidate.session, candidateSelector(id));
		const [dragSourceCrop, dragCandidateCrop] = await Promise.all([
			captureClip(source.session, sourceRect, source.pageOffset),
			captureClip(candidate.session, draggedRect, candidate.pageOffset),
		]);
		const dragCrop = await saveCropPair(
			`${id}-dragged`,
			dragSourceCrop,
			dragCandidateCrop,
		);
		const dragSnapshot = await candidate.session.evaluate(
			snapshotExpression(candidateSelector(id), candidateProperties),
		);
		actionStates.push({
			id,
			focused: {
				crop: focusCrop,
				structural: compareSnapshots(
					settled.find((item) => item.id === id).structural
						? JSON.parse(
								await readFile(
									path.join(
										outputRoot,
										"structural",
										`${id}-settled-source.json`,
									),
									"utf8",
								),
							)
						: null,
					focusSnapshot,
					"focused",
				),
			},
			dragged: {
				requestedDelta: delta,
				crop: dragCrop,
				structural: compareSnapshots(
					JSON.parse(
						await readFile(
							path.join(outputRoot, "structural", `${id}-settled-source.json`),
							"utf8",
						),
					),
					dragSnapshot,
					"dragged",
				),
			},
		});
	}

	report = {
		gate: "G3-terminal-window-forensic-parity",
		mode,
		generatedAt: new Date().toISOString(),
		sourceUrl,
		candidateUrl,
		viewport,
		computedPropertyDepth: sourceProperties.length,
		settled,
		typingLoop: {
			alignment:
				"extracted source event keyframes; candidate sought deterministically; never wall-clock aligned",
			keyframeCount: loopStates.length,
			contentFailures: loopStates.filter((state) => !state.contentEqual),
			maximumPixelDifferencePercent: Math.max(
				...loopStates.map((state) => state.pixel.diffPercent),
			),
			meanPixelDifferencePercent:
				loopStates.reduce((sum, state) => sum + state.pixel.diffPercent, 0) /
				loopStates.length,
			states: loopStates,
		},
		assetReadiness: candidateAssetReadiness,
		actionStates,
		sanctionedDivergences: {
			drag: "D005",
			focus: "D006",
			terminalInputPlacementAndKeyboardStrip: "D007",
		},
	};
	const whitelistedSettledProperties = new Set([
		"data-opaline-window-id",
		"data-opaline-draggable-window",
		"data-opaline-drag-x",
		"data-opaline-drag-y",
		"aria-grabbed",
		"aria-label",
		"translate",
	]);
	const unsanctionedSettledDifferences = report.settled.flatMap((state) =>
		state.structural.differences
			.filter(
				(difference) => !whitelistedSettledProperties.has(difference.property),
			)
			.map((difference) => ({ id: state.id, ...difference })),
	);
	const expectedFamily = '"JetBrains Mono", "JetBrains Mono Fallback"';
	const checks = {
		propertyDepth: report.computedPropertyDepth === 475,
		settledStructure: unsanctionedSettledDifferences.length === 0,
		settledPixels: report.settled.every(
			(state) => state.crop.pixel.diffPercent <= 0.25,
		),
		loopContent: report.typingLoop.contentFailures.length === 0,
		loopPixels: report.typingLoop.maximumPixelDifferencePercent <= 0.03,
		fontLoaded:
			report.assetReadiness.jetBrainsMonoLoaded &&
			report.assetReadiness.windows.every(
				(state) => state.fontFamily === expectedFamily,
			),
		actionPixels: report.actionStates.every(
			(state) =>
				state.focused.crop.pixel.diffPercent <= 0.1 &&
				state.dragged.crop.pixel.diffPercent <= 0.1,
		),
	};
	report.verdict = {
		passed: Object.values(checks).every(Boolean),
		checks,
		unsanctionedSettledDifferences,
	};
	const matrix = {
		gate: report.gate,
		mode,
		generatedAt: report.generatedAt,
		computedPropertyDepth: report.computedPropertyDepth,
		states: [
			...report.settled.map((state) => ({
				name: `terminal-${state.id}-settled`,
				kind: "tight-crop-structural-pixel",
				crop: state.crop,
				structuralDifferenceCount: state.structural.differences.length,
			})),
			...report.actionStates.flatMap((state) => [
				{
					name: `terminal-${state.id}-focused-raised`,
					kind: "tight-crop-structural-pixel",
					crop: state.focused.crop,
				},
				{
					name: `terminal-${state.id}-dragged`,
					kind: "tight-crop-structural-pixel",
					requestedDelta: state.dragged.requestedDelta,
					crop: state.dragged.crop,
				},
			]),
			...report.typingLoop.states.map((state) => ({
				name: `terminal-terminal-loop-${String(state.index).padStart(4, "0")}-${state.phase}`,
				kind: "loop-aligned-content-pixel",
				elapsed: state.elapsed,
				exchangeIndex: state.exchangeIndex,
				contentEqual: state.contentEqual,
				pixel: state.pixel,
			})),
		],
		assetReadiness: report.assetReadiness,
		verdict: report.verdict,
	};
	await writeFile(
		path.join(gateRoot, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	await writeFile(
		path.join(gateRoot, "matrix.json"),
		`${JSON.stringify(matrix, null, 2)}\n`,
	);
	console.log(
		JSON.stringify(
			{
				computedPropertyDepth: report.computedPropertyDepth,
				settled: report.settled.map((state) => ({
					id: state.id,
					structuralDifferences: state.structural.differences.length,
					pixelDifferencePercent: state.crop.pixel.diffPercent,
				})),
				loopKeyframes: report.typingLoop.keyframeCount,
				loopContentFailures: report.typingLoop.contentFailures.length,
				loopMaximumPixelDifferencePercent:
					report.typingLoop.maximumPixelDifferencePercent,
				actionStates: report.actionStates.length * 2,
				passed: report.verdict.passed,
			},
			null,
			2,
		),
	);
	if (mode === "after" && !report.verdict.passed) {
		throw new Error(
			`terminal-window parity gate failed: ${JSON.stringify(report.verdict)}`,
		);
	}
} finally {
	await Promise.allSettled([source.session.close(), candidate.session.close()]);
}
