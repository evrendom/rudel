import { dashboardAmbientProgram } from "../components/generated/dashboard-ambient-data";

interface AmbientSeekState {
	outerMs: number;
	revealMs: number;
	tableMs: number;
	terminalMs: number;
}

interface AmbientDebugController {
	getState: () => AmbientSeekState & { reducedMotion: boolean };
	resume: () => void;
	seek: (state: AmbientSeekState) => void;
}

type WindowApp = "call" | "slack" | "terminal";

type WindowRevealState =
	| { elapsed: number; kind: "exit" }
	| { elapsed: number; kind: "time" }
	| { kind: "scroll"; scrollY: number };

declare global {
	interface Window {
		__opalineDashboardAmbient: AmbientDebugController | undefined;
	}
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
	Math.min(maximum, Math.max(minimum, value));

const cubicCoordinate = (time: number, first: number, second: number) => {
	const inverse = 1 - time;
	return (
		3 * inverse * inverse * time * first +
		3 * inverse * time * time * second +
		time * time * time
	);
};

const cubicBezier = (
	progress: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
) => {
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

const easeOut = (progress: number) => cubicBezier(progress, 0, 0, 0.58, 1);
const easeUi = (progress: number) => cubicBezier(progress, 0.33, 1, 0.68, 1);

const cloneElement = (element: Element | null) => {
	if (!element) return null;
	const clone = element.cloneNode(true);
	return clone instanceof HTMLElement ? clone : null;
};

const setTextAfterFirstChild = (element: HTMLElement, text: string) => {
	const first = element.firstElementChild;
	if (!first) {
		element.textContent = text;
		return;
	}
	element.replaceChildren(first, document.createTextNode(text));
};

const typeCount = (elapsed: number, length: number, speed: number) =>
	clamp(Math.floor(Math.max(0, elapsed) / speed), 0, length);

const interpolateScale = (elapsed: number) => {
	const keyframes = dashboardAmbientProgram.windows.scrollScaleKeyframes;
	const first = keyframes[0];
	const last = keyframes.at(-1);
	if (!first || !last || elapsed <= first.t) return first?.scale ?? 1;
	if (elapsed >= last.t) return last.scale;
	for (let index = 1; index < keyframes.length; index += 1) {
		const right = keyframes[index];
		const left = keyframes[index - 1];
		if (!right || !left || elapsed > right.t) continue;
		const progress = clamp((elapsed - left.t) / (right.t - left.t));
		return left.scale + (right.scale - left.scale) * progress;
	}
	return last.scale;
};

const isWindowApp = (value: string): value is WindowApp =>
	value === "call" || value === "slack" || value === "terminal";

const getComposedWindowState = (
	frame: (typeof dashboardAmbientProgram.windows.composedScrollCurve.keyframes)[number],
	app: WindowApp,
) => {
	if (app === "call") return frame.windows.call;
	if (app === "slack") return frame.windows.slack;
	return frame.windows.terminal;
};

const getComposedExitWindowState = (
	frame: (typeof dashboardAmbientProgram.windows.composedScrollCurve.exit.keyframes)[number],
	app: WindowApp,
) => {
	if (app === "call") return frame.windows.call;
	if (app === "slack") return frame.windows.slack;
	return frame.windows.terminal;
};

const parseBlur = (filter: string) => {
	if (filter === "none") return 0;
	return Number(filter.match(/blur\(([-\d.]+)px\)/)?.[1] ?? 0);
};

const interpolateComposedWindowCurve = (scrollY: number, app: WindowApp) => {
	const keyframes =
		dashboardAmbientProgram.windows.composedScrollCurve.keyframes;
	const first = keyframes[0];
	const last = keyframes.at(-1);
	if (!first || !last) return { blur: 0, opacity: 1, scale: 0.95 };
	if (scrollY <= first.scrollY) {
		const state = getComposedWindowState(first, app);
		return {
			blur: parseBlur(state.filter),
			opacity: state.opacity,
			scale: first.scale,
		};
	}
	if (scrollY >= last.scrollY) {
		const state = getComposedWindowState(last, app);
		return {
			blur: parseBlur(state.filter),
			opacity: state.opacity,
			scale: last.scale,
		};
	}
	for (let index = 1; index < keyframes.length; index += 1) {
		const right = keyframes[index];
		const left = keyframes[index - 1];
		if (!right || !left || scrollY > right.scrollY) continue;
		const progress = clamp(
			(scrollY - left.scrollY) / (right.scrollY - left.scrollY),
		);
		const leftWindow = getComposedWindowState(left, app);
		const rightWindow = getComposedWindowState(right, app);
		return {
			blur:
				parseBlur(leftWindow.filter) +
				(parseBlur(rightWindow.filter) - parseBlur(leftWindow.filter)) *
					progress,
			opacity:
				leftWindow.opacity +
				(rightWindow.opacity - leftWindow.opacity) * progress,
			scale: left.scale + (right.scale - left.scale) * progress,
		};
	}
	const state = getComposedWindowState(last, app);
	return {
		blur: parseBlur(state.filter),
		opacity: state.opacity,
		scale: last.scale,
	};
};

const interpolateComposedWindowExit = (elapsed: number, app: WindowApp) => {
	const keyframes =
		dashboardAmbientProgram.windows.composedScrollCurve.exit.keyframes;
	const first = keyframes[0];
	const last = keyframes.at(-1);
	if (!first || !last) return { blur: 3, opacity: 0, scale: 1 };
	if (elapsed <= first.t) {
		const state = getComposedExitWindowState(first, app);
		return {
			blur: parseBlur(state.filter),
			opacity: state.opacity,
			scale: first.scale,
		};
	}
	if (elapsed >= last.t) {
		const state = getComposedExitWindowState(last, app);
		return {
			blur: parseBlur(state.filter),
			opacity: state.opacity,
			scale: last.scale,
		};
	}
	for (let index = 1; index < keyframes.length; index += 1) {
		const right = keyframes[index];
		const left = keyframes[index - 1];
		if (!right || !left || elapsed > right.t) continue;
		const progress = clamp((elapsed - left.t) / (right.t - left.t));
		const leftWindow = getComposedExitWindowState(left, app);
		const rightWindow = getComposedExitWindowState(right, app);
		return {
			blur:
				parseBlur(leftWindow.filter) +
				(parseBlur(rightWindow.filter) - parseBlur(leftWindow.filter)) *
					progress,
			opacity:
				leftWindow.opacity +
				(rightWindow.opacity - leftWindow.opacity) * progress,
			scale: left.scale + (right.scale - left.scale) * progress,
		};
	}
	const state = getComposedExitWindowState(last, app);
	return {
		blur: parseBlur(state.filter),
		opacity: state.opacity,
		scale: last.scale,
	};
};

const parseChurned = (value: string) => {
	const minutes = Number(value.match(/(\d+)m/)?.[1] ?? 0);
	const seconds = Number(value.match(/(\d+)s/)?.[1] ?? 0);
	const tokens = Number(value.match(/↓\s*(\d+)k/)?.[1] ?? 0);
	return { seconds: minutes * 60 + seconds, tokens };
};

const getTerminalElements = (windowElement: HTMLElement) => {
	const content = Array.from(
		windowElement.querySelectorAll<HTMLElement>("div"),
	).find(
		(element) =>
			element.classList.contains("bg-black-50") &&
			element.classList.contains("font-mono"),
	);
	const body = content?.children[0];
	const responseGrid = body?.children[0];
	const tokenRow = body?.children[1];
	const promptGrid = body?.children[2];
	if (
		!(content instanceof HTMLElement) ||
		!(responseGrid instanceof HTMLElement) ||
		!(tokenRow instanceof HTMLElement) ||
		!(promptGrid instanceof HTMLElement)
	) {
		return null;
	}
	const scaffoldWrapper = responseGrid.firstElementChild;
	const scaffold = scaffoldWrapper?.firstElementChild;
	const promptTemplate = cloneElement(scaffold?.children[0] ?? null);
	const commandsTemplate = cloneElement(scaffold?.children[1] ?? null);
	const answerTemplate = cloneElement(scaffold?.children[2] ?? null);
	const tokenTemplate = cloneElement(tokenRow.querySelector("p"));
	const liveResponseTemplate = cloneElement(responseGrid.children[1]);
	const livePromptTemplate = cloneElement(promptGrid.children[1]);
	const promptTextTemplate = cloneElement(
		promptGrid.firstElementChild?.children[1] ?? null,
	);
	const cursorTemplate = cloneElement(
		document.querySelector(
			'[data-opaline-dashboard-part="desktop-window"] span[aria-hidden="true"].ml-px',
		),
	);
	if (
		!promptTemplate ||
		!commandsTemplate ||
		!answerTemplate ||
		!tokenTemplate ||
		!livePromptTemplate ||
		!promptTextTemplate ||
		!cursorTemplate
	) {
		return null;
	}
	return {
		responseGrid,
		tokenRow,
		promptGrid,
		promptTemplate,
		commandsTemplate,
		answerTemplate,
		tokenTemplate,
		liveResponseClass: liveResponseTemplate?.className ?? "[grid-area:1/1]",
		livePromptTemplate,
		promptTextTemplate,
		cursorTemplate,
	};
};

const createPromptRow = (template: HTMLElement, prompt: string) => {
	const row = cloneElement(template);
	const text = row?.children[1];
	if (!(row instanceof HTMLElement) || !(text instanceof HTMLElement))
		return null;
	text.textContent = prompt;
	return row;
};

const createCommands = (
	template: HTMLElement,
	commandCount: number,
	ranText: string,
	commands: readonly string[],
	commandTexts: readonly string[],
) => {
	const group = cloneElement(template);
	if (!group) return null;
	const ranRow = group.children[0];
	if (ranRow instanceof HTMLElement) {
		setTextAfterFirstChild(ranRow, ranText);
	}
	for (let index = group.children.length - 1; index >= 1; index -= 1) {
		group.children[index]?.remove();
	}
	for (let index = 0; index < commandCount; index += 1) {
		const sourceRow =
			template.children[Math.min(index + 1, template.children.length - 1)];
		const row = cloneElement(sourceRow ?? null);
		if (!row) continue;
		row.textContent = `⎿ ${commandTexts[index] ?? commands[index] ?? ""}`;
		group.append(row);
	}
	return group;
};

const createAnswer = (
	template: HTMLElement,
	answer: string,
	visible: string,
) => {
	const row = cloneElement(template);
	const answerContainer = row?.children[1];
	const hidden = answerContainer?.children[0];
	const painted = answerContainer?.children[1];
	if (
		!(row instanceof HTMLElement) ||
		!(hidden instanceof HTMLElement) ||
		!(painted instanceof HTMLElement)
	) {
		return null;
	}
	hidden.textContent = answer;
	painted.textContent = visible;
	return row;
};

const installTerminal = (
	windowElement: HTMLElement,
	reducedMotion: boolean,
) => {
	const elements = getTerminalElements(windowElement);
	if (!elements) return null;
	let previousSignature = "";
	let cursor: HTMLElement | null = null;

	const render = (elapsed: number) => {
		const terminal = dashboardAmbientProgram.terminal;
		const cycleDuration = terminal.exchangeDuration * terminal.exchanges.length;
		const normalized = reducedMotion
			? terminal.exchangeDuration - 1
			: ((elapsed % cycleDuration) + cycleDuration) % cycleDuration;
		const exchangeIndex = reducedMotion
			? terminal.exchanges.length - 1
			: Math.floor(normalized / terminal.exchangeDuration);
		const exchange = terminal.exchanges[exchangeIndex] ?? terminal.exchanges[0];
		if (!exchange) return;
		const local = reducedMotion
			? terminal.exchangeDuration - 1
			: normalized % terminal.exchangeDuration;
		const typingEnd = exchange.prompt.length * terminal.typeSpeed;
		const thinkingStart = typingEnd + terminal.typedPause;
		const respondingStart = thinkingStart + terminal.thinkingDuration;
		const promptCharacters = typeCount(
			local,
			exchange.prompt.length,
			terminal.typeSpeed,
		);
		const phase =
			local < typingEnd
				? "typing"
				: local < thinkingStart
					? "typed"
					: local < respondingStart
						? "thinking"
						: "responding";
		const responseElapsed = Math.max(0, local - respondingStart);
		const ranLabel = `Ran ${exchange.commands.length} commands`;
		const ranElapsed = responseElapsed - terminal.responseStartDelay;
		const ranCharacters = typeCount(
			ranElapsed,
			ranLabel.length,
			terminal.typeSpeed,
		);
		let commandElapsed = ranElapsed - ranLabel.length * terminal.typeSpeed;
		const commandTexts: string[] = [];
		let completedCommands = 0;
		for (const command of exchange.commands) {
			const characters = typeCount(
				commandElapsed,
				command.length,
				terminal.commandTypeSpeed,
			);
			if (commandElapsed > 0) commandTexts.push(command.slice(0, characters));
			if (characters >= command.length) completedCommands += 1;
			commandElapsed -= command.length * terminal.commandTypeSpeed;
		}
		const answerElapsed = Math.max(0, commandElapsed);
		const answerCharacters =
			completedCommands === exchange.commands.length
				? typeCount(answerElapsed, exchange.answer.length, terminal.typeSpeed)
				: 0;
		const churnElapsed = Math.max(0, local - thinkingStart);
		const churnStep = Math.min(
			terminal.churnDuration,
			Math.floor(churnElapsed / terminal.churnTick) * terminal.churnTick,
		);
		const signature = JSON.stringify({
			exchangeIndex,
			phase,
			promptCharacters,
			ranCharacters,
			commandTexts,
			answerCharacters,
			churnStep,
		});
		if (signature !== previousSignature) {
			previousSignature = signature;
			cursor = null;
			const livePrompt = cloneElement(elements.livePromptTemplate);
			let promptText = livePrompt?.children[1];
			if (livePrompt && !(promptText instanceof HTMLElement)) {
				promptText = cloneElement(elements.promptTextTemplate);
				if (promptText) livePrompt.append(promptText);
			}
			if (livePrompt && promptText instanceof HTMLElement) {
				promptText.textContent =
					phase === "typing"
						? exchange.prompt.slice(0, promptCharacters)
						: phase === "typed"
							? exchange.prompt
							: "";
				if (phase === "typing" && promptCharacters < exchange.prompt.length) {
					cursor = cloneElement(elements.cursorTemplate);
					if (cursor) promptText.append(cursor);
				}
				elements.promptGrid.children[1]?.replaceWith(livePrompt);
			}

			elements.responseGrid.children[1]?.remove();
			if (phase === "thinking" || phase === "responding") {
				const response = document.createElement("div");
				response.className = elements.liveResponseClass;
				const body = document.createElement("div");
				const scaffold =
					elements.responseGrid.firstElementChild?.firstElementChild;
				body.className =
					scaffold instanceof HTMLElement ? scaffold.className : "";
				const prompt = createPromptRow(
					elements.promptTemplate,
					exchange.prompt,
				);
				if (prompt) body.append(prompt);
				if (phase === "responding") {
					const commands = createCommands(
						elements.commandsTemplate,
						commandTexts.length,
						ranLabel.slice(0, ranCharacters),
						exchange.commands,
						commandTexts,
					);
					if (commands) body.append(commands);
					if (answerCharacters > 0) {
						const answer = createAnswer(
							elements.answerTemplate,
							exchange.answer,
							exchange.answer.slice(0, answerCharacters),
						);
						if (answer) body.append(answer);
					}
				}
				response.append(body);
				elements.responseGrid.append(response);
			}

			elements.tokenRow.replaceChildren();
			if (phase === "thinking" || phase === "responding") {
				const token = cloneElement(elements.tokenTemplate);
				const icon = token?.children[0];
				const label = token?.children[1];
				if (
					token instanceof HTMLElement &&
					icon instanceof HTMLElement &&
					label instanceof HTMLElement
				) {
					if (phase === "thinking") {
						const target = parseChurned(exchange.churned);
						const progress = clamp(churnStep / terminal.churnDuration);
						const seconds = Math.max(1, Math.round(target.seconds * progress));
						const tokens = Math.max(1, Math.round(target.tokens * progress));
						const spinnerIndex = Math.floor(churnStep / terminal.churnTick);
						icon.textContent =
							terminal.spinnerFrames[
								spinnerIndex % terminal.spinnerFrames.length
							];
						label.textContent = `Churning… (${seconds}s · ↓ ${tokens}k tokens)`;
						token.className = token.className.replace(
							"text-black-700",
							"text-[#D97757]",
						);
					} else {
						icon.textContent = "·";
						label.textContent = `Churned (${exchange.churned})`;
						token.className = token.className.replace(
							"text-[#D97757]",
							"text-black-700",
						);
					}
					elements.tokenRow.append(token);
				}
			}
		}
		if (cursor) {
			const cursorElapsed = local % terminal.cursorAnimation.duration;
			cursor.style.opacity = String(
				1 - easeOut(cursorElapsed / terminal.cursorAnimation.duration),
			);
		}
	};

	return { render };
};

const installTable = (shell: HTMLElement, reducedMotion: boolean) => {
	let table: HTMLElement | null = null;
	let cells: Array<{
		leaf: HTMLElement;
		thinking: HTMLElement;
		overlay: HTMLElement;
		result: HTMLElement;
	}> = [];
	let tableStartedAt = 0;

	const refresh = (now: number) => {
		const nextTable = shell.querySelector<HTMLElement>(".home-ui-data-table");
		if (nextTable === table) return;
		table = nextTable;
		tableStartedAt = now;
		cells = [];
		if (!table) return;
		const leaves = Array.from(
			table.querySelectorAll<HTMLElement>("span"),
		).filter(
			(element) =>
				element.children.length === 0 &&
				element.textContent === "AI is thinking...",
		);
		for (const leaf of leaves) {
			const thinking = leaf.parentElement?.parentElement;
			const overlay = thinking?.nextElementSibling;
			const result = overlay?.nextElementSibling;
			if (
				thinking instanceof HTMLElement &&
				overlay instanceof HTMLElement &&
				result instanceof HTMLElement
			) {
				cells.push({ leaf, thinking, overlay, result });
			}
		}
	};

	const render = (now: number, debugElapsed: number | null) => {
		refresh(now);
		if (!table) return;
		const elapsed = reducedMotion
			? Number.POSITIVE_INFINITY
			: (debugElapsed ?? now - tableStartedAt);
		const shimmer = dashboardAmbientProgram.table.shimmer;
		const shimmerProgress = Number.isFinite(elapsed)
			? easeOut(elapsed / shimmer.duration)
			: 1;
		const backgroundPosition =
			shimmer.from + (shimmer.to - shimmer.from) * shimmerProgress;
		for (const [index, cell] of cells.entries()) {
			const program = dashboardAmbientProgram.table.cells[index];
			if (!program) continue;
			const thinkingProgress = Number.isFinite(elapsed)
				? easeOut((elapsed - program.delay) / program.thinking.duration)
				: 1;
			const overlayProgress = Number.isFinite(elapsed)
				? easeOut((elapsed - program.delay) / program.overlay.duration)
				: 1;
			const resultProgress = Number.isFinite(elapsed)
				? easeOut((elapsed - program.delay) / program.resultAnimation.duration)
				: 1;
			cell.leaf.style.backgroundPosition = `${backgroundPosition}% 0%`;
			cell.thinking.style.opacity = String(1 - thinkingProgress);
			cell.thinking.style.transform = `translateX(${4 * thinkingProgress}px)`;
			cell.overlay.style.opacity = String(overlayProgress);
			cell.result.style.opacity = String(resultProgress);
			cell.result.style.transform =
				resultProgress >= 0.999
					? "none"
					: `translateX(${4 * (1 - resultProgress)}px)`;
		}
	};

	return { render };
};

const installWindows = (reducedMotion: boolean) => {
	const windows = Array.from(
		document.querySelectorAll<HTMLElement>(
			'[data-opaline-dashboard-part="desktop-window"]',
		),
	)
		.map((element) => {
			const app = element.dataset.opalineDashboardApp ?? "";
			if (!isWindowApp(app)) return null;
			return {
				app,
				element,
				inner: element.parentElement,
				outer: element.parentElement?.parentElement,
			};
		})
		.filter((record) => record !== null);
	for (const outer of new Set(
		windows.map((windowRecord) => windowRecord.outer),
	)) {
		if (!outer) continue;
		// D006: the captured aux group used opacity + z-index, which trapped every
		// auxiliary window in one stacking context below the main window. Preserve
		// the same effective fade on each window and release the shared layer so all
		// four windows can participate in one product-owned stack.
		outer.style.opacity = "1";
		outer.style.zIndex = "auto";
		outer.dataset.opalineWindowStackLayer = "";
	}

	const render = (outerElapsed: number, revealState: WindowRevealState) => {
		for (const windowRecord of windows) {
			const entrance = Object.entries(
				dashboardAmbientProgram.windows.outerEntrance,
			).find(([app]) => app === windowRecord.app)?.[1];
			if (!entrance || !windowRecord.inner || !windowRecord.outer) continue;
			const outerProgress = reducedMotion
				? 1
				: easeOut((outerElapsed - entrance.delay) / entrance.duration);
			let revealProgress = 1;
			let blur = 0;
			let scale = dashboardAmbientProgram.windows.settled.scale;
			if (!reducedMotion && revealState.kind === "time") {
				const revealIndex = dashboardAmbientProgram.windows.revealOrder.indexOf(
					windowRecord.app,
				);
				const revealDelay =
					Math.max(0, revealIndex) *
					dashboardAmbientProgram.windows.revealDelayStep;
				revealProgress = easeUi(
					(revealState.elapsed - revealDelay) /
						dashboardAmbientProgram.windows.revealDuration,
				);
				blur =
					Math.round(
						dashboardAmbientProgram.windows.revealBlur *
							(1 - revealProgress) *
							2,
					) / 2;
				scale = interpolateScale(Math.max(0, revealState.elapsed));
			}
			if (!reducedMotion && revealState.kind === "scroll") {
				const state = interpolateComposedWindowCurve(
					revealState.scrollY,
					windowRecord.app,
				);
				revealProgress = state.opacity;
				blur = state.blur;
				scale = state.scale;
			}
			if (!reducedMotion && revealState.kind === "exit") {
				const state = interpolateComposedWindowExit(
					revealState.elapsed,
					windowRecord.app,
				);
				revealProgress = state.opacity;
				blur = state.blur;
				scale = state.scale;
			}
			if (outerProgress === 1) {
				windowRecord.element.style.removeProperty("opacity");
			} else {
				windowRecord.element.style.opacity = String(outerProgress);
			}
			windowRecord.inner.style.opacity = String(revealProgress);
			windowRecord.inner.style.filter =
				blur <= 0.25 ? "none" : `blur(${blur}px)`;
			windowRecord.element.style.transform = `scale(${scale})`;
		}
	};

	return { render };
};

export function installDashboardAmbientMotion(shell: HTMLElement) {
	const reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	const startedAt = performance.now();
	let maximumRevealScrollY = window.scrollY;
	let exitStartedAt = Number.POSITIVE_INFINITY;
	let hasRevealed =
		window.scrollY >=
		dashboardAmbientProgram.windows.composedScrollCurve.exit
			.triggerBelowScrollY;
	let debugState: AmbientSeekState | null = null;
	let frame = 0;
	const terminalWindow = document.querySelector<HTMLElement>(
		'[data-opaline-dashboard-part="desktop-window"][data-opaline-dashboard-app="terminal"]',
	);
	const terminal = terminalWindow
		? installTerminal(terminalWindow, reducedMotion)
		: null;
	const table = installTable(shell, reducedMotion);
	const windows = installWindows(reducedMotion);
	const control = document.createElement("output");
	control.hidden = true;
	control.dataset.opalineDashboardAmbientControl = "";
	document.body.append(control);

	const render = (now: number) => {
		const outerElapsed = debugState?.outerMs ?? now - startedAt;
		const exitThreshold =
			dashboardAmbientProgram.windows.composedScrollCurve.exit
				.triggerBelowScrollY;
		if (window.scrollY >= exitThreshold) {
			if (Number.isFinite(exitStartedAt)) {
				maximumRevealScrollY = window.scrollY;
			}
			hasRevealed = true;
			exitStartedAt = Number.POSITIVE_INFINITY;
			maximumRevealScrollY = Math.max(maximumRevealScrollY, window.scrollY);
		} else if (hasRevealed && !Number.isFinite(exitStartedAt)) {
			exitStartedAt = now;
		}
		let revealState: WindowRevealState = {
			kind: "scroll",
			scrollY: maximumRevealScrollY,
		};
		if (Number.isFinite(exitStartedAt)) {
			revealState = { elapsed: now - exitStartedAt, kind: "exit" };
		}
		if (debugState) {
			revealState = { elapsed: debugState.revealMs, kind: "time" };
		}
		const tableElapsed = debugState?.tableMs ?? null;
		const terminalElapsed = debugState?.terminalMs ?? now - startedAt;
		windows.render(outerElapsed, revealState);
		table.render(now, tableElapsed);
		terminal?.render(terminalElapsed);
		control.textContent = JSON.stringify({
			outerMs: outerElapsed,
			revealMs:
				debugState?.revealMs ??
				(Number.isFinite(exitStartedAt)
					? now - exitStartedAt
					: maximumRevealScrollY),
			tableMs: tableElapsed ?? now - startedAt,
			terminalMs: terminalElapsed,
			reducedMotion,
		});
	};

	const tick = (now: number) => {
		render(now);
		if (!debugState && !reducedMotion) frame = requestAnimationFrame(tick);
	};

	window.__opalineDashboardAmbient = {
		getState: () => ({
			outerMs: debugState?.outerMs ?? performance.now() - startedAt,
			revealMs:
				debugState?.revealMs ??
				(Number.isFinite(exitStartedAt)
					? performance.now() - exitStartedAt
					: maximumRevealScrollY),
			tableMs: debugState?.tableMs ?? performance.now() - startedAt,
			terminalMs: debugState?.terminalMs ?? performance.now() - startedAt,
			reducedMotion,
		}),
		resume: () => {
			debugState = null;
			cancelAnimationFrame(frame);
			if (!reducedMotion) frame = requestAnimationFrame(tick);
		},
		seek: (state) => {
			debugState = { ...state };
			cancelAnimationFrame(frame);
			render(performance.now());
		},
	};
	control.addEventListener("opaline:ambient-seek", () => {
		const outerMs = Number(control.dataset.outerMs);
		const revealMs = Number(control.dataset.revealMs);
		const tableMs = Number(control.dataset.tableMs);
		const terminalMs = Number(control.dataset.terminalMs);
		if ([outerMs, revealMs, tableMs, terminalMs].some(Number.isNaN)) return;
		window.__opalineDashboardAmbient?.seek({
			outerMs,
			revealMs,
			tableMs,
			terminalMs,
		});
	});
	control.addEventListener("opaline:ambient-resume", () => {
		window.__opalineDashboardAmbient?.resume();
	});

	render(startedAt);
	control.dataset.opalineAmbientReady = "";
	if (!reducedMotion) frame = requestAnimationFrame(tick);
}
