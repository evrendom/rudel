const root = document.documentElement;
const layer = document.querySelector<HTMLElement>("[data-aperture-root]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

if (layer && !reducedMotion.matches) {
	root.dataset.aperture = "idle";

	let progress = 0;
	let touchY: number | null = null;
	let chroma = 0;
	let chromaFrame = 0;
	let previousInputTime = performance.now();
	let previousFrameTime = performance.now();
	const scrollRange = Math.max(720, innerHeight * 1.1);
	const finalScale = Math.max(
		1,
		(Math.hypot(innerWidth, innerHeight) * 2.2) / 48,
	);

	const render = () => {
		root.dataset.opalineProgress = progress.toFixed(6);
		const scale = Math.exp(Math.log(finalScale) * progress);
		layer.style.setProperty("--aperture-size", `${48 * scale}px`);
		layer.style.setProperty("--aperture-hole", `${13.4 * scale}px`);
		layer.style.setProperty("--aperture-chroma", chroma.toFixed(4));
	};

	const removeControls = () => {
		removeEventListener("wheel", handleWheel);
		removeEventListener("keydown", handleKeydown);
		removeEventListener("pointerdown", handlePointerDown);
		removeEventListener("pointermove", handlePointerMove);
		removeEventListener("pointerup", handlePointerEnd);
		removeEventListener("pointercancel", handlePointerEnd);
	};

	const finish = () => {
		progress = 1;
		root.dataset.opalineProgress = "1";
		chroma = 0;
		render();
		removeControls();
		cancelAnimationFrame(chromaFrame);
		root.dataset.aperture = "released";
		requestAnimationFrame(() => layer.remove());
	};

	const animateChroma = (now: number) => {
		const elapsed = Math.min(64, Math.max(0, now - previousFrameTime));
		previousFrameTime = now;
		chroma *= Math.exp(-elapsed / 190);
		render();
		if (chroma > 0.003 && progress < 1) {
			chromaFrame = requestAnimationFrame(animateChroma);
		} else {
			chroma = 0;
			chromaFrame = 0;
			render();
		}
	};

	const scrub = (delta: number) => {
		if (delta === 0 || progress >= 1) return;
		root.dataset.aperture = "revealing";
		const next = Math.min(1, Math.max(0, progress + delta / scrollRange));
		if (next === progress) return;
		const now = performance.now();
		const elapsed = Math.max(16, Math.min(80, now - previousInputTime));
		previousInputTime = now;
		chroma = Math.max(chroma, Math.min(1, Math.abs(delta) / elapsed / 1.8));
		progress = next;
		render();
		if (progress >= 1) {
			finish();
		} else if (chromaFrame === 0) {
			previousFrameTime = now;
			chromaFrame = requestAnimationFrame(animateChroma);
		}
	};

	function handleWheel(event: WheelEvent) {
		const multiplier =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? innerHeight
					: 1;
		if (event.deltaY === 0) return;
		event.preventDefault();
		scrub(event.deltaY * multiplier);
	}

	function handleKeydown(event: KeyboardEvent) {
		const amounts: Record<string, number> = {
			ArrowDown: 80,
			ArrowUp: -80,
			PageDown: 320,
			PageUp: -320,
			" ": event.shiftKey ? -320 : 320,
		};
		if (!(event.key in amounts)) return;
		event.preventDefault();
		scrub(amounts[event.key]);
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === "touch") touchY = event.clientY;
	}

	function handlePointerMove(event: PointerEvent) {
		if (event.pointerType !== "touch" || touchY === null) return;
		event.preventDefault();
		const delta = touchY - event.clientY;
		touchY = event.clientY;
		scrub(delta);
	}

	function handlePointerEnd(event: PointerEvent) {
		if (event.pointerType === "touch") touchY = null;
	}

	addEventListener("wheel", handleWheel, { passive: false });
	addEventListener("keydown", handleKeydown);
	addEventListener("pointerdown", handlePointerDown, { passive: true });
	addEventListener("pointermove", handlePointerMove, { passive: false });
	addEventListener("pointerup", handlePointerEnd, { passive: true });
	addEventListener("pointercancel", handlePointerEnd, { passive: true });
	render();
} else {
	root.dataset.aperture = "released";
	layer?.remove();
}
