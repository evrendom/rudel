const shell = document.querySelector<HTMLElement>(
	'[data-opaline-dashboard-part="attio-window-shell"]',
);
const sceneButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-opaline-use-case]"),
);
let pendingSceneChange = 0;
// Median measured from the settled 4180 composition's selected-state to panel
// replacement transition (three rAF-observed runs: 32.7, 36.3, 38.6 ms).
const panelSwapDelayMs = 36;

const normalizePanelViewport = (panel: HTMLElement | null) => {
	const scaleWrapper =
		panel?.firstElementChild?.firstElementChild?.firstElementChild;
	if (!(scaleWrapper instanceof HTMLElement) || !panel) return;

	const shouldFillPanel = window.innerWidth < 992 || panel.clientWidth >= 1152;
	if (shouldFillPanel) {
		scaleWrapper.className = "h-full w-full";
		scaleWrapper.removeAttribute("style");
		return;
	}

	scaleWrapper.className = "";
	const scale = (panel.clientWidth / 1152).toFixed(6);
	scaleWrapper.style.cssText = [
		"height: 625.928px",
		`transform: scale(${scale})`,
		"transform-origin: left top",
		"width: 1152px",
	].join("; ");
};

const normalizeCurrentPanelViewport = () => {
	normalizePanelViewport(
		shell?.querySelector<HTMLElement>("[data-opaline-dashboard-panel]") ?? null,
	);
};

const selectScene = (scene: string, focus = false) => {
	if (!shell) return;
	const template = document.querySelector<HTMLTemplateElement>(
		`template[data-opaline-dashboard-panel-template="${CSS.escape(scene)}"]`,
	);
	for (const button of sceneButtons) {
		const selected = button.dataset.opalineUseCase === scene;
		button.setAttribute("aria-selected", String(selected));
		button.tabIndex = selected ? 0 : -1;
	}
	if (focus) {
		sceneButtons
			.find((button) => button.dataset.opalineUseCase === scene)
			?.focus();
	}
	const sceneChange = ++pendingSceneChange;
	setTimeout(() => {
		if (sceneChange !== pendingSceneChange) return;
		const currentPanel = shell.querySelector<HTMLElement>(
			"[data-opaline-dashboard-panel]",
		);
		const nextPanel = template?.content.firstElementChild?.cloneNode(true);
		if (
			!(currentPanel instanceof HTMLElement) ||
			!(nextPanel instanceof HTMLElement)
		)
			return;
		currentPanel.replaceWith(nextPanel);
		normalizePanelViewport(nextPanel);
	}, panelSwapDelayMs);
};

normalizeCurrentPanelViewport();
const panelResizeObserver = new ResizeObserver(normalizeCurrentPanelViewport);
if (shell) panelResizeObserver.observe(shell);

for (const button of sceneButtons) {
	button.addEventListener("click", () => {
		if (button.dataset.opalineUseCase) {
			selectScene(button.dataset.opalineUseCase);
		}
	});
	button.addEventListener("keydown", (event) => {
		if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) {
			return;
		}
		event.preventDefault();
		const currentIndex = sceneButtons.findIndex(
			(candidate) => candidate.getAttribute("aria-selected") === "true",
		);
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? sceneButtons.length - 1
					: (currentIndex +
							(event.key === "ArrowRight" ? 1 : -1) +
							sceneButtons.length) %
						sceneButtons.length;
		const scene = sceneButtons[nextIndex]?.dataset.opalineUseCase;
		if (scene) selectScene(scene, true);
	});
}
