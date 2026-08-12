import { installDashboardAmbientMotion } from "./dashboard-ambient";

const shell = document.querySelector<HTMLElement>(
	'[data-opaline-dashboard-part="attio-window-shell"]',
);
const auxiliaryWindows = Array.from(
	document.querySelectorAll<HTMLElement>(
		'[data-opaline-dashboard-part="desktop-window"]',
	),
);
const windowElements = shell ? [shell, ...auxiliaryWindows] : auxiliaryWindows;
const dragThreshold = 3;

for (const [index, windowElement] of windowElements.entries()) {
	const app =
		windowElement.getAttribute("data-opaline-dashboard-app") ??
		(index === 0 && windowElement === shell ? "main" : `auxiliary-${index}`);
	windowElement.dataset.opalineWindowId = app;
	windowElement.dataset.opalineDraggableWindow = "";
	windowElement.dataset.opalineDragX = "0";
	windowElement.dataset.opalineDragY = "0";
	windowElement.setAttribute("aria-grabbed", "false");
	if (!windowElement.hasAttribute("aria-label")) {
		windowElement.setAttribute("aria-label", `Draggable ${app} window`);
	}
}

const numericZIndex = (element: HTMLElement) =>
	Number.parseInt(
		element.style.zIndex || getComputedStyle(element).zIndex,
		10,
	) || 0;

const bringWindowForward = (selected: HTMLElement) => {
	const selectedZIndex = numericZIndex(selected);
	const maximumZIndex = Math.max(...windowElements.map(numericZIndex));
	if (selectedZIndex >= maximumZIndex) return;
	for (const windowElement of windowElements) {
		if (windowElement === selected) continue;
		const zIndex = numericZIndex(windowElement);
		if (zIndex > selectedZIndex) {
			windowElement.style.zIndex = String(zIndex - 1);
		}
	}
	selected.style.zIndex = String(maximumZIndex);
};

type ActiveDrag = {
	element: HTMLElement;
	pointerId: number;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	nextX: number;
	nextY: number;
	dragging: boolean;
};

let activeDrag: ActiveDrag | null = null;
let dragFrame = 0;

const renderDrag = () => {
	dragFrame = 0;
	if (!activeDrag) return;
	const { element, nextX, nextY } = activeDrag;
	element.style.setProperty("--opaline-drag-x", `${nextX}px`);
	element.style.setProperty("--opaline-drag-y", `${nextY}px`);
	element.dataset.opalineDragX = String(nextX);
	element.dataset.opalineDragY = String(nextY);
};

const scheduleDragRender = () => {
	if (dragFrame === 0) dragFrame = requestAnimationFrame(renderDrag);
};

for (const windowElement of windowElements) {
	windowElement.addEventListener(
		"pointerdown",
		(event) => {
			if (event.button !== 0 || activeDrag) return;
			const eventTarget = event.target;
			if (!(eventTarget instanceof Element)) return;
			if (
				eventTarget.closest("[data-opaline-draggable-window]") !== windowElement
			) {
				return;
			}
			// D006: stack focus is synchronous on pointer-down and deliberately does
			// not cancel the event, so buttons and links inside the main window click.
			bringWindowForward(windowElement);
			activeDrag = {
				element: windowElement,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				originX: Number(windowElement.dataset.opalineDragX ?? 0),
				originY: Number(windowElement.dataset.opalineDragY ?? 0),
				nextX: Number(windowElement.dataset.opalineDragX ?? 0),
				nextY: Number(windowElement.dataset.opalineDragY ?? 0),
				dragging: false,
			};
		},
		{ capture: true },
	);

	windowElement.addEventListener("keydown", (event) => {
		if (event.target !== windowElement) return;
		if (
			!new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]).has(
				event.key,
			)
		) {
			return;
		}
		event.preventDefault();
		bringWindowForward(windowElement);
		const step = event.shiftKey ? 1 : 10;
		const nextX = Number(windowElement.dataset.opalineDragX ?? 0);
		const nextY = Number(windowElement.dataset.opalineDragY ?? 0);
		const updatedX =
			nextX +
			(event.key === "ArrowRight"
				? step
				: event.key === "ArrowLeft"
					? -step
					: 0);
		const updatedY =
			nextY +
			(event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0);
		windowElement.style.setProperty("--opaline-drag-x", `${updatedX}px`);
		windowElement.style.setProperty("--opaline-drag-y", `${updatedY}px`);
		windowElement.dataset.opalineDragX = String(updatedX);
		windowElement.dataset.opalineDragY = String(updatedY);
	});
}

window.addEventListener(
	"pointermove",
	(event) => {
		if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
		const deltaX = event.clientX - activeDrag.startX;
		const deltaY = event.clientY - activeDrag.startY;
		if (!activeDrag.dragging && Math.hypot(deltaX, deltaY) < dragThreshold) {
			return;
		}
		if (!activeDrag.dragging) {
			activeDrag.dragging = true;
			activeDrag.element.dataset.opalineDragging = "";
			activeDrag.element.setAttribute("aria-grabbed", "true");
			activeDrag.element.setPointerCapture(event.pointerId);
		}
		activeDrag.nextX = activeDrag.originX + deltaX;
		activeDrag.nextY = activeDrag.originY + deltaY;
		scheduleDragRender();
		if (event.cancelable) event.preventDefault();
	},
	{ capture: true },
);

const finishDrag = (event: PointerEvent) => {
	if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
	if (activeDrag.dragging) {
		activeDrag.nextX = activeDrag.originX + event.clientX - activeDrag.startX;
		activeDrag.nextY = activeDrag.originY + event.clientY - activeDrag.startY;
		renderDrag();
		if (activeDrag.element.hasPointerCapture(event.pointerId)) {
			activeDrag.element.releasePointerCapture(event.pointerId);
		}
	}
	activeDrag.element.removeAttribute("data-opaline-dragging");
	activeDrag.element.setAttribute("aria-grabbed", "false");
	activeDrag = null;
};

window.addEventListener("pointerup", finishDrag, { capture: true });
window.addEventListener("pointercancel", finishDrag, { capture: true });

if (shell) installDashboardAmbientMotion(shell);
