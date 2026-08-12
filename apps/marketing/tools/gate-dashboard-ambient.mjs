import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const outputRoot = path.resolve(".context/gates/dashboard/ambient");
const programPath = path.resolve(
	".context/extractions/dashboard/ambient/program/program.json",
);
const sourceUrl = "http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const candidateUrl = "http://127.0.0.1:4321/preview/dashboard-branded";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const FRAME_MS = 1000 / 60;
const program = JSON.parse(await readFile(programPath, "utf8"));

const clamp = (value, minimum = 0, maximum = 1) =>
	Math.min(maximum, Math.max(minimum, value));

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
		answer: "",
		tokenIcon: "",
		tokenLabel: "",
	};
	if (phase === "typing" || phase === "typed") {
		state.promptText = exchange.prompt.slice(
			0,
			phase === "typed"
				? exchange.prompt.length
				: typeCount(local, exchange.prompt.length, terminal.typeSpeed),
		);
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

const terminalMapperExpression = `(() => {
	const windowElement = document.querySelector('[data-opaline-dashboard-app="terminal"]');
	const content = [...windowElement.querySelectorAll('div')].find((element) =>
		element.classList.contains('bg-black-50') && element.classList.contains('font-mono')
	);
	const body = content.children[0];
	const responseGrid = body.children[0];
	const tokenRow = body.children[1];
	const promptGrid = body.children[2];
	const response = responseGrid.children[1];
	const responseBody = response?.firstElementChild;
	const responsePrompt = responseBody?.children[0]?.children[1]?.textContent ?? '';
	const commandsGroup = responseBody?.children[1];
	const answerRow = responseBody?.children[2];
	return {
		promptText: promptGrid.children[1]?.children[1]?.textContent ?? '',
		responsePrompt,
		ranText: commandsGroup?.children[0]?.textContent?.replace(/^●/, '') ?? '',
		commands: commandsGroup ? [...commandsGroup.children].slice(1).map((row) => row.textContent?.replace(/^⎿ /, '') ?? '') : [],
		answer: answerRow?.children[1]?.children[1]?.textContent ?? '',
		tokenIcon: tokenRow.firstElementChild?.children[0]?.textContent ?? '',
		tokenLabel: tokenRow.firstElementChild?.children[1]?.textContent ?? '',
	};
})()`;

const seekExpression = (state) => `(() => {
	const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
	Object.assign(control.dataset, ${JSON.stringify(
		Object.fromEntries(
			Object.entries(state).map(([key, value]) => [key, String(value)]),
		),
	)});
	control.dispatchEvent(new Event('opaline:ambient-seek'));
})()`;

const stateSession = await createBrowserSession({
	url: candidateUrl,
	...viewport,
});
let sequenceReport;
try {
	await stateSession.waitFor(
		'document.querySelector("[data-opaline-dashboard-ambient-control]")?.hasAttribute("data-opaline-ambient-ready")',
	);
	const eventTimes = terminalEventTimes();
	const actual = await stateSession.evaluate(`(() => {
		const times = ${JSON.stringify(eventTimes)};
		const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
		const read = () => ${terminalMapperExpression};
		const sample = (terminalMs) => {
			Object.assign(control.dataset, {
				outerMs: '2500', revealMs: '1000', tableMs: '3300', terminalMs: String(terminalMs),
			});
			control.dispatchEvent(new Event('opaline:ambient-seek'));
			return read();
		};
		return times.map((t) => ({ t, before: sample(Math.max(0, t - 1)), at: sample(t) }));
	})()`);
	const failures = [];
	for (const sample of actual) {
		const expectedBefore = terminalExpectedAt(Math.max(0, sample.t - 1));
		const expectedAt = terminalExpectedAt(sample.t);
		const comparableBefore = {
			...expectedBefore,
			exchangeIndex: undefined,
			phase: undefined,
		};
		const comparableAt = {
			...expectedAt,
			exchangeIndex: undefined,
			phase: undefined,
		};
		delete comparableBefore.exchangeIndex;
		delete comparableBefore.phase;
		delete comparableAt.exchangeIndex;
		delete comparableAt.phase;
		if (JSON.stringify(sample.before) !== JSON.stringify(comparableBefore)) {
			failures.push({
				t: sample.t,
				edge: "before",
				expected: comparableBefore,
				actual: sample.before,
			});
		}
		if (JSON.stringify(sample.at) !== JSON.stringify(comparableAt)) {
			failures.push({
				t: sample.t,
				edge: "at",
				expected: comparableAt,
				actual: sample.at,
			});
		}
	}

	const tableChecks = await stateSession.evaluate(`(() => {
		const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
		const table = document.querySelector('[data-opaline-dashboard-part="attio-window-shell"] .home-ui-data-table');
		const leaves = [...table.querySelectorAll('span')].filter((element) =>
			element.children.length === 0 && element.textContent === 'AI is thinking...'
		);
		const read = () => leaves.map((leaf, index) => {
			const thinking = leaf.parentElement.parentElement;
			const overlay = thinking.nextElementSibling;
			const result = overlay.nextElementSibling;
			return {
				index,
				thinkingOpacity: Number(getComputedStyle(thinking).opacity),
				overlayOpacity: Number(getComputedStyle(overlay).opacity),
				resultOpacity: Number(getComputedStyle(result).opacity),
				resultText: result.textContent.trim(),
			};
		});
		const times = [...new Set(${JSON.stringify(
			program.table.cells.flatMap((cell) => [
				cell.delay - 1,
				cell.delay,
				cell.delay + cell.thinking.duration,
				cell.delay + cell.overlay.duration,
				cell.delay + cell.resultAnimation.duration,
			]),
		)})].sort((left, right) => left - right);
		return times.map((tableMs) => {
			Object.assign(control.dataset, {
				outerMs: '2500', revealMs: '1000', tableMs: String(tableMs), terminalMs: '7000',
			});
			control.dispatchEvent(new Event('opaline:ambient-seek'));
			return { tableMs, cells: read() };
		});
	})()`);
	const tableFailures = [];
	for (const checkpoint of tableChecks) {
		for (const cell of checkpoint.cells) {
			const cellProgram = program.table.cells[cell.index];
			if (!cellProgram || cell.resultText !== cellProgram.result) {
				tableFailures.push({
					tableMs: checkpoint.tableMs,
					cell,
					reason: "content",
				});
				continue;
			}
			if (
				checkpoint.tableMs < cellProgram.delay &&
				cell.thinkingOpacity < 0.999
			) {
				tableFailures.push({
					tableMs: checkpoint.tableMs,
					cell,
					reason: "early-thinking",
				});
			}
			if (
				checkpoint.tableMs >=
					cellProgram.delay + cellProgram.resultAnimation.duration &&
				cell.resultOpacity < 0.999
			) {
				tableFailures.push({
					tableMs: checkpoint.tableMs,
					cell,
					reason: "late-result",
				});
			}
		}
	}

	const windowChecks = await stateSession.evaluate(`(() => {
		const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
		const read = () => [...document.querySelectorAll('[data-opaline-dashboard-part="desktop-window"]')].map((element) => ({
			app: element.dataset.opalineDashboardApp,
			outerOpacity: Number(getComputedStyle(element).opacity),
			innerOpacity: Number(getComputedStyle(element.parentElement).opacity),
			filter: getComputedStyle(element.parentElement).filter,
			transform: getComputedStyle(element).transform,
			backgroundColor: getComputedStyle(element).backgroundColor,
		}));
		const checkpoints = [
			{ outerMs: 1199, revealMs: -1 },
			{ outerMs: 2400, revealMs: -1 },
			{ outerMs: 2500, revealMs: 0 },
			{ outerMs: 2500, revealMs: 600 },
			{ outerMs: 2500, revealMs: 1000 },
		];
		return checkpoints.map((checkpoint) => {
			Object.assign(control.dataset, {
				outerMs: String(checkpoint.outerMs), revealMs: String(checkpoint.revealMs),
				tableMs: '3300', terminalMs: '7000',
			});
			control.dispatchEvent(new Event('opaline:ambient-seek'));
			return { ...checkpoint, windows: read() };
		});
	})()`);
	const settled = windowChecks.at(-1)?.windows ?? [];
	const right = settled.find((windowRecord) => windowRecord.app === "call");
	const windowFailures = [];
	if (
		!right ||
		right.innerOpacity < 0.999 ||
		right.outerOpacity < 0.999 ||
		right.backgroundColor !== program.windows.settled.rightBackground
	) {
		windowFailures.push({
			reason: "right-settled-style",
			expected: program.windows.settled,
			actual: right,
		});
	}
	sequenceReport = {
		terminal: {
			recordedKeyframes: eventTimes.length,
			timingToleranceMs: FRAME_MS,
			failures,
			passed: failures.length === 0,
		},
		table: {
			cells: program.table.cells.length,
			checkpoints: tableChecks.length,
			failures: tableFailures,
			passed: tableFailures.length === 0,
		},
		windows: {
			checkpoints: windowChecks,
			settledRight: right,
			failures: windowFailures,
			passed: windowFailures.length === 0,
		},
	};
} finally {
	await stateSession.close();
}

const reducedSession = await createBrowserSession({
	url: candidateUrl,
	...viewport,
	reducedMotion: true,
});
let reducedMotionReport;
try {
	await reducedSession.waitFor(
		'document.querySelector("[data-opaline-dashboard-ambient-control]")?.hasAttribute("data-opaline-ambient-ready")',
	);
	const readReduced = `(() => {
		const terminal = document.querySelector('[data-opaline-dashboard-app="terminal"]');
		const leaves = [...document.querySelectorAll('[data-opaline-dashboard-part="attio-window-shell"] .home-ui-data-table span')]
			.filter((element) => element.children.length === 0 && element.textContent === 'AI is thinking...');
		return {
			terminal: terminal.innerText,
			thinking: leaves.filter((leaf) => Number(getComputedStyle(leaf.parentElement.parentElement).opacity) > .5).length,
			results: leaves.filter((leaf) => Number(getComputedStyle(leaf.parentElement.parentElement.nextElementSibling.nextElementSibling).opacity) > .5).length,
			windows: [...document.querySelectorAll('[data-opaline-dashboard-part="desktop-window"]')].map((element) => ({
				app: element.dataset.opalineDashboardApp,
				outer: Number(getComputedStyle(element).opacity),
				inner: Number(getComputedStyle(element.parentElement).opacity),
				filter: getComputedStyle(element.parentElement).filter,
				transform: getComputedStyle(element).transform,
			})),
		};
	})()`;
	const before = await reducedSession.evaluate(readReduced);
	await wait(1_200);
	const after = await reducedSession.evaluate(readReduced);
	reducedMotionReport = {
		before,
		after,
		passed:
			before.terminal === after.terminal &&
			before.thinking === 0 &&
			before.results === 26 &&
			before.windows.every(
				(windowRecord) =>
					windowRecord.outer === 1 &&
					windowRecord.inner === 1 &&
					windowRecord.filter === "none",
			),
	};
} finally {
	await reducedSession.close();
}

const cropPng = async (inputPath, outputPath, rect) => {
	const source = PNG.sync.read(await readFile(inputPath));
	const x = Math.max(0, Math.floor(rect.x));
	const y = Math.max(0, Math.floor(rect.y));
	const width = Math.min(source.width - x, Math.floor(rect.width));
	const height = Math.min(source.height - y, Math.floor(rect.height));
	const target = new PNG({ width, height });
	PNG.bitblt(source, target, x, y, width, height, 0, 0);
	await writeFile(outputPath, PNG.sync.write(target));
	return { x, y, width, height };
};

const freezeSourceTerminal = async (session, condition) =>
	session.evaluate(
		`new Promise((resolve, reject) => {
			const deadline = performance.now() + 20000;
			const tick = () => {
				const windowElement = document.querySelector('[data-home-hero="desktop-window"][data-home-hero-app="terminal"]');
				if (windowElement && (${condition})) {
					const clone = windowElement.cloneNode(true);
					windowElement.replaceWith(clone);
					return resolve(clone.getBoundingClientRect().toJSON());
				}
				if (performance.now() >= deadline) return reject(new Error('terminal checkpoint timed out'));
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		})`,
		{ awaitPromise: true },
	);

const tableStateAt = (elapsed) => ({
	thinking: program.table.cells.filter(
		(cell) => elapsed < cell.delay + cell.thinking.duration / 2,
	).length,
	results: program.table.cells.filter(
		(cell) => elapsed >= cell.delay + cell.resultAnimation.duration / 2,
	).length,
});

const exchangeTwo = program.terminal.exchanges[1];
const exchangeTwoBase = program.terminal.exchangeDuration;
const exchangeTwoTypingText = exchangeTwo.prompt.slice(0, 24);
const exchangeTwoTypingMs = exchangeTwoBase + 24 * program.terminal.typeSpeed;
const exchangeTwoThinkingStart =
	exchangeTwoBase +
	exchangeTwo.prompt.length * program.terminal.typeSpeed +
	program.terminal.typedPause;
const exchangeTwoThinkingMs = exchangeTwoThinkingStart + 900;
const exchangeTwoThinkingLabel = terminalExpectedAt(
	exchangeTwoThinkingMs,
).tokenLabel;
const ranTwo = `Ran ${exchangeTwo.commands.length} commands`;
const exchangeTwoAnswerStart =
	exchangeTwoThinkingStart +
	program.terminal.thinkingDuration +
	program.terminal.responseStartDelay +
	ranTwo.length * program.terminal.typeSpeed +
	exchangeTwo.commands.reduce(
		(total, command) =>
			total + command.length * program.terminal.commandTypeSpeed,
		0,
	);
const exchangeTwoAnswerText = exchangeTwo.answer;
const exchangeTwoAnswerMs =
	exchangeTwoAnswerStart +
	exchangeTwo.answer.length * program.terminal.typeSpeed +
	50;
const pixelCheckpoints = [
	{ type: "table", name: "table-wave", tableMs: 2200 },
	{ type: "table", name: "table-settled", tableMs: 3400 },
	{
		type: "terminal",
		name: "terminal-typing",
		terminalMs: exchangeTwoTypingMs,
		condition: `windowElement.innerText.includes(${JSON.stringify(exchangeTwoTypingText)}) && !windowElement.innerText.includes(${JSON.stringify(exchangeTwoTypingText + exchangeTwo.prompt[24])})`,
	},
	{
		type: "terminal",
		name: "terminal-thinking",
		terminalMs: exchangeTwoThinkingMs,
		condition: `windowElement.innerText.includes(${JSON.stringify(exchangeTwo.prompt)}) && windowElement.innerText.includes(${JSON.stringify(exchangeTwoThinkingLabel)})`,
	},
	{
		type: "terminal",
		name: "terminal-answer",
		terminalMs: exchangeTwoAnswerMs,
		condition: `windowElement.innerText.includes(${JSON.stringify(exchangeTwoAnswerText)})`,
	},
];

await mkdir(outputRoot, { recursive: true });
const pixelResults = [];
for (const checkpoint of pixelCheckpoints) {
	const sourceSession = await createBrowserSession(viewport);
	let sourceRect;
	try {
		if (checkpoint.type === "table") {
			const state = tableStateAt(checkpoint.tableMs);
			await sourceSession.client.call("Page.addScriptToEvaluateOnNewDocument", {
				source: `(() => {
					const materialize = (source, clone) => {
						const sourceElements = [source, ...source.querySelectorAll('*')];
						const cloneElements = [clone, ...clone.querySelectorAll('*')];
						for (let index = 0; index < sourceElements.length; index += 1) {
							const sourceElement = sourceElements[index];
							const cloneElement = cloneElements[index];
							if (!(sourceElement instanceof HTMLElement) || !(cloneElement instanceof HTMLElement)) continue;
							const computed = getComputedStyle(sourceElement);
							for (const property of ['opacity', 'transform', 'filter', 'background-position']) {
								cloneElement.style.setProperty(property, computed.getPropertyValue(property));
							}
						}
					};
					const tick = () => {
						const table = document.querySelector('.home-ui-data-table');
						const leaves = table ? [...table.querySelectorAll('span')].filter((element) => element.children.length === 0 && element.textContent === 'AI is thinking...') : [];
						const cells = leaves.map((leaf) => {
							const thinkingLayer = leaf.parentElement.parentElement;
							const resultLayer = thinkingLayer.nextElementSibling.nextElementSibling;
							return { thinking: Number(getComputedStyle(thinkingLayer).opacity), result: Number(getComputedStyle(resultLayer).opacity) };
						});
						const thinkingCount = cells.filter((cell) => cell.thinking > .5).length;
						const resultCount = cells.filter((cell) => cell.result > .5).length;
						if (table && thinkingCount === ${state.thinking} && resultCount === ${state.results}) {
							const template = document.createElement('template');
							template.dataset.opalineTableCheckpoint = '';
							const clone = table.cloneNode(true);
							materialize(table, clone);
							template.content.append(clone);
							document.documentElement.append(template);
							return;
						}
						requestAnimationFrame(tick);
					};
					requestAnimationFrame(tick);
				})();`,
			});
		}
		await sourceSession.navigate(sourceUrl);
		await sourceSession.waitFor(
			'document.querySelector("[data-home-hero=attio-window-shell]") && document.querySelectorAll("[data-home-hero=desktop-window]").length === 3',
		);
		await sourceSession.evaluate(
			"new Promise((resolve) => { scrollTo(0, 500); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ awaitPromise: true },
		);
		if (checkpoint.type === "table") {
			await sourceSession.waitFor(
				'document.querySelector("template[data-opaline-table-checkpoint]")',
			);
			sourceRect = await sourceSession.evaluate(`(() => {
				const table = document.querySelector('.home-ui-data-table');
				const frozen = document.querySelector('template[data-opaline-table-checkpoint]')?.content.firstElementChild?.cloneNode(true);
				if (!(table instanceof HTMLElement) || !(frozen instanceof HTMLElement)) throw new Error('captured table checkpoint missing');
				table.replaceWith(frozen);
				return frozen.getBoundingClientRect().toJSON();
			})()`);
		} else {
			sourceRect = await freezeSourceTerminal(
				sourceSession,
				checkpoint.condition,
			);
		}
		await sourceSession.evaluate(`(() => {
			for (const region of document.querySelectorAll('[role="region"]')) {
				if (region.textContent?.includes('We use cookies to improve your experience')) region.remove();
			}
		})()`);
		await sourceSession.screenshot(
			path.join(outputRoot, `${checkpoint.name}-source-full.png`),
		);
	} finally {
		await sourceSession.close();
	}

	const candidateSession = await createBrowserSession({
		url: candidateUrl,
		...viewport,
	});
	let candidateRect;
	try {
		await candidateSession.waitFor(
			'document.querySelector("[data-opaline-dashboard-ambient-control]")?.hasAttribute("data-opaline-ambient-ready")',
		);
		await candidateSession.evaluate(
			seekExpression({
				outerMs: 2500,
				revealMs: 1000,
				tableMs: checkpoint.tableMs ?? 3400,
				terminalMs: checkpoint.terminalMs ?? 7000,
			}),
		);
		candidateRect = await candidateSession.evaluate(
			checkpoint.type === "table"
				? 'document.querySelector("[data-opaline-dashboard-part=attio-window-shell] .home-ui-data-table").getBoundingClientRect().toJSON()'
				: 'document.querySelector("[data-opaline-dashboard-app=terminal]").getBoundingClientRect().toJSON()',
		);
		await candidateSession.screenshot(
			path.join(outputRoot, `${checkpoint.name}-candidate-full.png`),
		);
	} finally {
		await candidateSession.close();
	}

	const sourceCrop = path.join(outputRoot, `${checkpoint.name}-source.png`);
	const candidateCrop = path.join(
		outputRoot,
		`${checkpoint.name}-candidate.png`,
	);
	let [sourceCropRect, candidateCropRect] = await Promise.all([
		cropPng(
			path.join(outputRoot, `${checkpoint.name}-source-full.png`),
			sourceCrop,
			sourceRect,
		),
		cropPng(
			path.join(outputRoot, `${checkpoint.name}-candidate-full.png`),
			candidateCrop,
			candidateRect,
		),
	]);
	if (
		sourceCropRect.width !== candidateCropRect.width ||
		sourceCropRect.height !== candidateCropRect.height
	) {
		const width = Math.min(sourceCropRect.width, candidateCropRect.width);
		const height = Math.min(sourceCropRect.height, candidateCropRect.height);
		[sourceCropRect, candidateCropRect] = await Promise.all([
			cropPng(
				path.join(outputRoot, `${checkpoint.name}-source-full.png`),
				sourceCrop,
				{ ...sourceRect, width, height },
			),
			cropPng(
				path.join(outputRoot, `${checkpoint.name}-candidate-full.png`),
				candidateCrop,
				{ ...candidateRect, width, height },
			),
		]);
	}
	const pixel = await comparePngs({
		leftPath: sourceCrop,
		rightPath: candidateCrop,
		diffPath: path.join(outputRoot, `${checkpoint.name}-diff.png`),
		threshold: 0.1,
	});
	pixelResults.push({
		...checkpoint,
		sourceCropRect,
		candidateCropRect,
		pixel,
	});
	console.log(`${checkpoint.name}: ${pixel.diffPercent.toFixed(6)}%`);
}

const report = {
	gate: "G3-dashboard-ambient",
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	viewport,
	programPath,
	sequence: sequenceReport,
	reducedMotion: reducedMotionReport,
	pixels: {
		alignment: "content/state checkpoints; never independent wall clocks",
		results: pixelResults,
		maximumDifferencePercent: Math.max(
			...pixelResults.map((result) => result.pixel.diffPercent),
		),
	},
};
report.passed =
	report.sequence.terminal.passed &&
	report.sequence.table.passed &&
	report.sequence.windows.passed &&
	report.reducedMotion.passed;
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			passed: report.passed,
			terminalKeyframes: report.sequence.terminal.recordedKeyframes,
			terminalFailures: report.sequence.terminal.failures.length,
			tableFailures: report.sequence.table.failures.length,
			windowFailures: report.sequence.windows.failures.length,
			reducedMotion: report.reducedMotion.passed,
			maximumPixelDifferencePercent: report.pixels.maximumDifferencePercent,
		},
		null,
		2,
	),
);
if (!report.passed) process.exitCode = 1;
