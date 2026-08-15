const initializeReplica = () => {
	const root = document.documentElement;
	root.dataset.opalineReplicaRuntime = "ready";

	const updateScrolledState = () => {
		root.toggleAttribute("data-scrolled", window.scrollY > 8);
	};
	updateScrolledState();
	window.addEventListener("scroll", updateScrolledState, { passive: true });

	const updateScreenScale = () => {
		const scale = Math.min(
			1,
			Math.max(0, window.innerWidth - 32) / 1200,
			Math.max(0, window.innerHeight - 32) / 640,
		);
		for (const viewport of document.querySelectorAll(
			"[data-opaline-screen-viewport]",
		)) {
			viewport.style.width = `${1200 * scale}px`;
			viewport.style.height = `${640 * scale}px`;
			const frame = viewport.querySelector("[data-opaline-screen-frame]");
			if (frame instanceof HTMLElement) {
				frame.style.transform = `scale(${scale})`;
			}
		}
	};
	updateScreenScale();
	window.addEventListener("resize", updateScreenScale, { passive: true });
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeReplica, { once: true });
} else {
	initializeReplica();
}
