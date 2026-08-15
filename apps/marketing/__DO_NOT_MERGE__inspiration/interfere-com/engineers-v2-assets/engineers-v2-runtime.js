const initializeReplica = () => {
	const root = document.documentElement;
	root.dataset.opalineReplicaRuntime = "ready";

	const updateScrolledState = () => {
		root.toggleAttribute("data-scrolled", window.scrollY > 8);
	};
	updateScrolledState();
	window.addEventListener("scroll", updateScrolledState, { passive: true });

	if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		for (const spinner of document.querySelectorAll(
			'output[aria-label="Loading"] > svg',
		)) {
			const capturedAngle = Number.parseFloat(
				spinner.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1] || "0",
			);
			spinner.animate(
				[
					{ transform: `rotate(${capturedAngle}deg)` },
					{ transform: `rotate(${capturedAngle + 360}deg)` },
				],
				{ duration: 1_000, iterations: Infinity, easing: "linear" },
			);
		}
	}

	for (const button of document.querySelectorAll(
		'button[aria-label="Scroll changelog left"], button[aria-label="Scroll changelog right"]',
	)) {
		button.addEventListener("click", () => {
			const direction = button.getAttribute("aria-label")?.endsWith("right")
				? 1
				: -1;
			const section = button.closest("section") || button.parentElement;
			const scroller = section?.querySelector(
				'[data-slot="scroll-area-viewport"], [data-overflow-x-start], .overflow-x-auto',
			);
			if (scroller instanceof HTMLElement) {
				scroller.scrollBy({
					behavior: "smooth",
					left: direction * Math.max(240, scroller.clientWidth * 0.7),
				});
			}
		});
	}
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeReplica, { once: true });
} else {
	initializeReplica();
}
