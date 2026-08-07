const shell = document.querySelector<HTMLElement>(
	'[data-opaline-dashboard-part="attio-window-shell"]',
);
const sceneButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-opaline-use-case]"),
);
let pendingSceneChange = 0;

const normalizePanelViewport = (panel: HTMLElement | null) => {
	const scaleWrapper = panel?.firstElementChild?.firstElementChild
		?.firstElementChild;
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
		) return;
		currentPanel.replaceWith(nextPanel);
		normalizePanelViewport(nextPanel);
	}, 64);
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

const auxiliaryWindows = Array.from(
	document.querySelectorAll<HTMLElement>(
		'[data-opaline-dashboard-part="desktop-window"]',
	),
);

for (const windowElement of auxiliaryWindows) {
	windowElement.dataset.opalineDraggableWindow = "";
	windowElement.tabIndex = 0;
	windowElement.setAttribute("aria-grabbed", "false");
	const app =
		windowElement.getAttribute("data-opaline-dashboard-app") ?? "auxiliary";
	windowElement.setAttribute("aria-label", `Draggable ${app} window`);

	let originX = 0;
	let originY = 0;
	let startX = 0;
	let startY = 0;
	let nextX = 0;
	let nextY = 0;
	let frame = 0;
	let activePointerId: number | null = null;

	const render = () => {
		frame = 0;
		windowElement.style.setProperty("--opaline-drag-x", `${nextX}px`);
		windowElement.style.setProperty("--opaline-drag-y", `${nextY}px`);
		windowElement.dataset.opalineDragX = String(nextX);
		windowElement.dataset.opalineDragY = String(nextY);
	};

	const scheduleRender = () => {
		if (frame === 0) frame = requestAnimationFrame(render);
	};

	windowElement.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		activePointerId = event.pointerId;
		windowElement.setPointerCapture(event.pointerId);
		windowElement.dataset.opalineDragging = "";
		windowElement.setAttribute("aria-grabbed", "true");
		startX = event.clientX;
		startY = event.clientY;
		originX = nextX;
		originY = nextY;
		windowElement.focus({ preventScroll: true });
	});

	windowElement.addEventListener("pointermove", (event) => {
		if (event.pointerId !== activePointerId) return;
		nextX = originX + event.clientX - startX;
		nextY = originY + event.clientY - startY;
		scheduleRender();
	});

	const finishPointerDrag = (event: PointerEvent) => {
		if (event.pointerId !== activePointerId) return;
		activePointerId = null;
		if (windowElement.hasPointerCapture(event.pointerId)) {
			windowElement.releasePointerCapture(event.pointerId);
		}
		windowElement.removeAttribute("data-opaline-dragging");
		windowElement.setAttribute("aria-grabbed", "false");
	};

	windowElement.addEventListener("pointerup", finishPointerDrag);
	windowElement.addEventListener("pointercancel", finishPointerDrag);
	windowElement.addEventListener("keydown", (event) => {
		if (!new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]).has(event.key)) {
			return;
		}
		event.preventDefault();
		const step = event.shiftKey ? 1 : 10;
		if (event.key === "ArrowLeft") nextX -= step;
		if (event.key === "ArrowRight") nextX += step;
		if (event.key === "ArrowUp") nextY -= step;
		if (event.key === "ArrowDown") nextY += step;
		scheduleRender();
	});
}
