for (const windowElement of document.querySelectorAll<HTMLElement>(
	"[data-drag-window]",
)) {
	const handle = windowElement.querySelector<HTMLElement>("[data-drag-handle]");
	if (!handle) continue;

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
		windowElement.style.setProperty("--drag-x", `${nextX}px`);
		windowElement.style.setProperty("--drag-y", `${nextY}px`);
	};

	handle.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		activePointerId = event.pointerId;
		handle.setPointerCapture(event.pointerId);
		startX = event.clientX;
		startY = event.clientY;
		originX = nextX;
		originY = nextY;
	});

	const moveDrag = (event: PointerEvent) => {
		if (event.pointerId !== activePointerId) return;
		nextX = originX + event.clientX - startX;
		nextY = originY + event.clientY - startY;
		if (frame === 0) frame = requestAnimationFrame(render);
	};

	const endDrag = (event: PointerEvent) => {
		if (event.pointerId !== activePointerId) return;
		activePointerId = null;
		if (handle.hasPointerCapture(event.pointerId)) {
			handle.releasePointerCapture(event.pointerId);
		}
	};

	addEventListener("pointermove", moveDrag, { passive: true });
	addEventListener("pointerup", endDrag, { passive: true });
	addEventListener("pointercancel", endDrag, { passive: true });
}
