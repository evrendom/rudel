const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const compactLayout = window.matchMedia("(max-width: 820px)");

const codeIcon = `
	<svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
		<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm9.354 3.646a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708-.708L10.293 8 9.146 6.854a.5.5 0 1 1 .708-.708l1.5 1.5ZM4.5 8a.5.5 0 0 1 .146-.354l1.5-1.5a.5.5 0 1 1 .708.708L5.707 8l1.147 1.146a.5.5 0 0 1-.708.708l-1.5-1.5A.5.5 0 0 1 4.5 8Z"/>
	</svg>`;

const copyIcon = `
	<svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
		<path fill="currentColor" d="M13 7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V7Zm-2.5-3A1 1 0 0 0 9.5 3H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h1V7a2 2 0 0 1 2-2h3.5V4Zm1 1h.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-.5H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5.5a2 2 0 0 1 2 2v1Z"/>
	</svg>`;

const terminalStates = {
	working: {
		label: "Agent working",
		line: "await session.run();",
		className: "syntax-comment",
	},
	error: {
		label: "Error found",
		line: 'throw new SessionError("race");',
		className: "syntax-error",
	},
	success: {
		label: "Resolved",
		line: 'session.resolve("tests passing");',
		className: "syntax-success",
	},
	captured: {
		label: "Shared with team",
		line: 'session.share("team memory");',
		className: "syntax-success",
	},
};

const escapeHtml = (value) =>
	value.replace(
		/[&<>'"]/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"'": "&#039;",
				'"': "&quot;",
			})[character],
	);

const buildTerminal = (host) => {
	const agentName = escapeHtml(host.dataset.agentName || "Agent");
	const file = escapeHtml(host.dataset.file || "agent-session.ts");
	const task = escapeHtml(host.dataset.task || "Explore codebase");

	host.innerHTML = `
		<div class="terminal" data-state="working">
			<div class="terminal__bar">
				<span class="terminal__traffic" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="terminal__file-icon">${codeIcon}</span>
				<p class="terminal__title">${file}</p>
				<span class="terminal__copy-mark">${copyIcon}</span>
			</div>
			<pre class="terminal__body"><code>
				<span class="terminal__line" data-line="1"><span><span class="syntax-keyword">import</span> { <span class="syntax-function">observe</span> } <span class="syntax-keyword">from</span> <span class="syntax-string">"@opaline/session"</span>;</span></span>
				<span class="terminal__line" data-line="2"><span><span class="syntax-keyword">const</span> session = <span class="syntax-function">observe</span>({</span></span>
				<span class="terminal__line" data-line="3"><span>&nbsp;&nbsp;<span class="syntax-property">agent</span>: <span class="syntax-string">"${agentName}"</span>,</span></span>
				<span class="terminal__line" data-line="4"><span>&nbsp;&nbsp;<span class="syntax-property">task</span>: <span class="syntax-string">"${task}"</span>,</span></span>
				<span class="terminal__line" data-line="5"><span>});</span></span>
				<span class="terminal__line" data-line="6" data-output data-active="true"><span class="syntax-comment">await session.run();</span></span>
			</code></pre>
			<div class="terminal__status">
				<span class="terminal__status-group"><span class="terminal__status-dot"></span><span data-status-label>Agent working</span></span>
				<span class="terminal__meta">main · 0:18</span>
			</div>
		</div>`;

	return {
		root: host.querySelector(".terminal"),
		output: host.querySelector("[data-output]"),
		status: host.querySelector("[data-status-label]"),
		state: "working",
	};
};

const terminals = [...document.querySelectorAll("[data-terminal]")].map(
	buildTerminal,
);

const setTerminalState = (terminal, nextState) => {
	if (!terminal?.root || terminal.state === nextState) return;
	const details = terminalStates[nextState] || terminalStates.working;
	terminal.state = nextState;
	terminal.root.dataset.state = nextState;
	terminal.status.textContent = details.label;
	terminal.output.innerHTML = `<span class="${details.className}">${escapeHtml(details.line)}</span>`;
};

const stateByBeat = [
	["working", "working", "working", "working"],
	["error", "working", "working", "working"],
	["success", "working", "working", "working"],
	["success", "working", "working", "working"],
	["captured", "captured", "captured", "captured"],
	["captured", "captured", "captured", "captured"],
	["captured", "captured", "captured", "captured"],
];

const desktopAgentPresets = [
	[
		[-32, -27, 0.82, 1, 1, 0.92, 0, 0.76, -0.8],
		[32, -27, 0.82, 1, 1, 0.92, 0, 0.76, 0.7],
		[-30, 27, 0.82, 1, 1, 0.92, 0, 0.76, 0.5],
		[30, 27, 0.82, 1, 1, 0.92, 0, 0.76, -0.6],
	],
	[
		[21, -1, 1.1, 1, 1, 1, 0, 0.8, 0],
		[35, -29, 0.56, 0.34, 0.14, 0.8, 0, 0.8, 0.6],
		[36, 27, 0.56, 0.34, 0.14, 0.8, 0, 0.8, -0.5],
		[-4, 34, 0.52, 0.25, 0, 0.8, 0, 0.8, 0.3],
	],
	[
		[-21, -2, 1.06, 1, 1, 1, 0, 0.8, 0],
		[-36, -29, 0.55, 0.38, 0.12, 0.8, 0, 0.8, -0.5],
		[-35, 28, 0.55, 0.38, 0.12, 0.8, 0, 0.8, 0.5],
		[3, 34, 0.52, 0.25, 0, 0.8, 0, 0.8, -0.3],
	],
	[
		[-30, -24, 0.72, 1, 0.72, 0.86, 1, 1, -0.4],
		[30, -24, 0.72, 1, 0.72, 0.86, 1, 1, 0.4],
		[-30, 24, 0.72, 1, 0.72, 0.86, 1, 1, 0.3],
		[30, 24, 0.72, 1, 0.72, 0.86, 1, 1, -0.3],
	],
	[
		[-17, -15, 0.69, 1, 0, 0.76, 0, 1.08, 0],
		[17, -15, 0.69, 1, 0, 0.76, 0, 1.08, 0],
		[-17, 13, 0.69, 1, 0, 0.76, 0, 1.08, 0],
		[17, 13, 0.69, 1, 0, 0.76, 0, 1.08, 0],
	],
	[
		[2, -28, 0.58, 1, 0.48, 0.72, 0, 0.9, 0],
		[4, -9, 0.58, 1, 0.48, 0.72, 0, 0.9, 0],
		[2, 10, 0.58, 1, 0.48, 0.72, 0, 0.9, 0],
		[4, 29, 0.58, 1, 0.48, 0.72, 0, 0.9, 0],
	],
	[
		[-31, -30, 0.5, 1, 0.2, 0.66, 0, 0.8, 0],
		[-30, -13, 0.5, 1, 0.2, 0.66, 0, 0.8, 0],
		[-31, 4, 0.5, 1, 0.2, 0.66, 0, 0.8, 0],
		[-30, 21, 0.5, 1, 0.2, 0.66, 0, 0.8, 0],
	],
];

const compactAgentPresets = [
	[
		[-20, -29, 0.63, 1, 1, 0.88, 0, 0.72, -0.5],
		[20, -29, 0.63, 1, 1, 0.88, 0, 0.72, 0.5],
		[-20, -11, 0.63, 1, 1, 0.88, 0, 0.72, 0.4],
		[20, -11, 0.63, 1, 1, 0.88, 0, 0.72, -0.4],
	],
	[
		[0, -25, 0.88, 1, 1, 1, 0, 0.8, 0],
		[-22, -5, 0.46, 0.35, 0, 0.8, 0, 0.8, 0],
		[0, -5, 0.46, 0.35, 0, 0.8, 0, 0.8, 0],
		[22, -5, 0.46, 0.35, 0, 0.8, 0, 0.8, 0],
	],
	[
		[0, -25, 0.86, 1, 1, 1, 0, 0.8, 0],
		[-22, -5, 0.46, 0.38, 0, 0.8, 0, 0.8, 0],
		[0, -5, 0.46, 0.38, 0, 0.8, 0, 0.8, 0],
		[22, -5, 0.46, 0.38, 0, 0.8, 0, 0.8, 0],
	],
	[
		[-19, -29, 0.6, 1, 0.72, 0.84, 1, 0.96, 0],
		[19, -29, 0.6, 1, 0.72, 0.84, 1, 0.96, 0],
		[-19, -11, 0.6, 1, 0.72, 0.84, 1, 0.96, 0],
		[19, -11, 0.6, 1, 0.72, 0.84, 1, 0.96, 0],
	],
	[
		[-14, -29, 0.56, 1, 0, 0.74, 0, 1, 0],
		[14, -29, 0.56, 1, 0, 0.74, 0, 1, 0],
		[-14, -13, 0.56, 1, 0, 0.74, 0, 1, 0],
		[14, -13, 0.56, 1, 0, 0.74, 0, 1, 0],
	],
	[
		[-17, -31, 0.48, 1, 0.34, 0.68, 0, 0.86, 0],
		[4, -31, 0.48, 1, 0.34, 0.68, 0, 0.86, 0],
		[-17, -16, 0.48, 1, 0.34, 0.68, 0, 0.86, 0],
		[4, -16, 0.48, 1, 0.34, 0.68, 0, 0.86, 0],
	],
	[
		[-27, -31, 0.39, 1, 0, 0.62, 0, 0.8, 0],
		[-9, -31, 0.39, 1, 0, 0.62, 0, 0.8, 0],
		[9, -31, 0.39, 1, 0, 0.62, 0, 0.8, 0],
		[27, -31, 0.39, 1, 0, 0.62, 0, 0.8, 0],
	],
];

const corePresets = [
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, -4, 1, 1],
	[21, 0, 0.92, 1],
	[-8, -25, 0.75, 0.92],
];

const compactCorePresets = [
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, 0, 0.8, 0],
	[0, -21, 0.88, 1],
	[19, -22, 0.72, 1],
	[0, -19, 0.66, 0.9],
];

const stagePresets = {
	connections: [0, 0, 0, 0.08, 1, 0.72, 0.32],
	error: [0, 1, 0, 0, 0, 0, 0],
	context: [0, 0, 1, 0, 0, 0, 0],
	memory: [0, 0, 0, 0, 0, 1, 0],
	insight: [0, 0, 0, 0, 0, 0, 1],
};

const journey = document.querySelector("[data-journey]");
const stage = document.querySelector("[data-stage]");
const agents = [...document.querySelectorAll("[data-agent]")];
const beats = [...document.querySelectorAll("[data-story-beat]")];
const progressLinks = [...document.querySelectorAll(".story-progress a")];
const currentBeatLabel = document.querySelector("[data-current-beat]");
const siteHeader = document.querySelector("[data-site-header]");

const clamp = (value, minimum = 0, maximum = 1) =>
	Math.min(maximum, Math.max(minimum, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const smoothstep = (value) => value * value * (3 - 2 * value);

let lastDiscreteBeat = -1;
let ticking = false;

const interpolatePreset = (presets, progress) => {
	const startIndex = Math.min(5, Math.floor(progress));
	const endIndex = Math.min(6, startIndex + 1);
	const amount = reducedMotion.matches
		? Math.round(progress - startIndex)
		: smoothstep(progress - startIndex);
	return presets[startIndex].map((value, index) =>
		lerp(value, presets[endIndex][index], amount),
	);
};

const setStageVariable = (name, value) => {
	stage?.style.setProperty(name, String(value));
};

const update = () => {
	ticking = false;
	if (!journey || !stage) return;

	const journeyTop = journey.getBoundingClientRect().top + window.scrollY;
	const rawProgress = (window.scrollY - journeyTop) / window.innerHeight;
	const progress = clamp(rawProgress, 0, 6);
	const discreteBeat = Math.round(progress);
	const agentPresets = compactLayout.matches
		? compactAgentPresets
		: desktopAgentPresets;
	const activeCorePresets = compactLayout.matches
		? compactCorePresets
		: corePresets;

	for (let index = 0; index < agents.length; index += 1) {
		const values = interpolatePreset(
			agentPresets.map((beatPreset) => beatPreset[index]),
			progress,
		);
		const [
			x,
			y,
			scale,
			opacity,
			terminalOpacity,
			terminalScale,
			bubbleOpacity,
			bubbleScale,
			rotation,
		] = values;
		const agent = agents[index];
		agent.style.setProperty("--agent-x", `${x}vw`);
		agent.style.setProperty("--agent-y", `${y}vh`);
		agent.style.setProperty("--agent-scale", String(scale));
		agent.style.setProperty("--agent-opacity", String(opacity));
		agent.style.setProperty("--terminal-opacity", String(terminalOpacity));
		agent.style.setProperty("--terminal-scale", String(terminalScale));
		agent.style.setProperty("--bubble-opacity", String(bubbleOpacity));
		agent.style.setProperty("--bubble-scale", String(bubbleScale));
		agent.style.setProperty("--agent-rotation", `${rotation}deg`);
	}

	const [coreX, coreY, coreScale, coreOpacity] = interpolatePreset(
		activeCorePresets,
		progress,
	);
	setStageVariable("--core-x", `${coreX}vw`);
	setStageVariable("--core-y", `${coreY}vh`);
	setStageVariable("--core-scale", coreScale);
	setStageVariable("--core-opacity", coreOpacity);

	for (const [name, presets] of Object.entries(stagePresets)) {
		setStageVariable(
			`--${name === "connections" ? "connections" : name}-opacity`,
			interpolatePreset(
				presets.map((value) => [value]),
				progress,
			)[0],
		);
	}

	for (let index = 0; index < beats.length; index += 1) {
		const distance = Math.abs(progress - index);
		const opacity = clamp(1 - distance * 1.55);
		const shift = clamp(index - progress, -1, 1) * 16;
		beats[index].style.setProperty("--copy-opacity", String(opacity));
		beats[index].style.setProperty("--copy-shift", `${shift}px`);
	}

	if (discreteBeat !== lastDiscreteBeat) {
		lastDiscreteBeat = discreteBeat;
		stage.dataset.beat = String(discreteBeat);
		currentBeatLabel.textContent = String(discreteBeat + 1).padStart(2, "0");
		stateByBeat[discreteBeat].forEach((state, index) => {
			setTerminalState(terminals[index], state);
		});
		for (const link of progressLinks) {
			const linkBeat = Number.parseInt(link.textContent || "1", 10) - 1;
			if (linkBeat === discreteBeat) link.setAttribute("aria-current", "step");
			else link.removeAttribute("aria-current");
		}
	}

	siteHeader.dataset.scrolled = String(window.scrollY > 18);
};

const requestUpdate = () => {
	if (ticking) return;
	ticking = true;
	window.requestAnimationFrame(update);
};

window.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("resize", requestUpdate, { passive: true });
compactLayout.addEventListener("change", requestUpdate);
reducedMotion.addEventListener("change", requestUpdate);
update();

document.querySelector("[data-replay]")?.addEventListener("click", () => {
	journey?.scrollIntoView({
		behavior: reducedMotion.matches ? "auto" : "smooth",
		block: "start",
	});
});
