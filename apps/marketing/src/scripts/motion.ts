const root = document.documentElement;
const hero = document.querySelector<HTMLElement>("[data-hero]");

const clamp = (value: number) => Math.min(1, Math.max(0, value));

let frame = 0;

const render = () => {
	frame = 0;
	const scrollY = window.scrollY;
	const titleProgress = clamp((scrollY - 20) / 180);
	const heroRange = Math.max(
		1,
		(hero?.offsetHeight ?? innerHeight) - innerHeight,
	);
	const heroProgress = clamp(scrollY / heroRange);
	root.style.setProperty("--title-progress", titleProgress.toFixed(4));
	root.style.setProperty("--hero-progress", heroProgress.toFixed(4));
};

const schedule = () => {
	if (frame !== 0) return;
	frame = requestAnimationFrame(render);
};

addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule, { passive: true });
addEventListener("pageshow", schedule, { passive: true });
schedule();
