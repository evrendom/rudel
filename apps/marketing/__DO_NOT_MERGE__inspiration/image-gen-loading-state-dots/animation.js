const canvas = document.querySelector(
	'[data-testid="image-gen-loading-state-dots"] canvas',
);

if (!(canvas instanceof HTMLCanvasElement)) {
	throw new Error("Missing image generation loading canvas.");
}

const context = canvas.getContext("2d", {
	alpha: true,
	desynchronized: true,
});

if (!context) {
	throw new Error("The browser could not create a 2D canvas context.");
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const gridSpacing = 13.55;
const restingRadius = 0.42;
const peakRadius = 1.82;
const cycleDuration = 6_800;
let width = 480;
let height = 480;
let pixelRatio = 2;
let animationFrame = 0;
let startTime = performance.now();

const resize = () => {
	const bounds = canvas.getBoundingClientRect();
	width = bounds.width;
	height = bounds.height;
	pixelRatio = Math.min(devicePixelRatio || 1, 2);
	const bitmapWidth = Math.max(1, Math.round(width * pixelRatio));
	const bitmapHeight = Math.max(1, Math.round(height * pixelRatio));

	if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
		canvas.width = bitmapWidth;
		canvas.height = bitmapHeight;
	}

	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
};

const smoothstep = (minimum, maximum, value) => {
	const normalized = Math.min(
		1,
		Math.max(0, (value - minimum) / (maximum - minimum)),
	);
	return normalized * normalized * (3 - 2 * normalized);
};

const draw = (time) => {
	const currentPixelRatio = Math.min(devicePixelRatio || 1, 2);
	if (currentPixelRatio !== pixelRatio) resize();

	const elapsed = reducedMotion.matches ? 0 : time - startTime;
	const phase = (elapsed / cycleDuration) * Math.PI * 2;
	const centerX = width * (0.33 + 0.22 * Math.sin(phase));
	const centerY = height * (0.55 + 0.17 * Math.sin(phase * 0.83 - 0.25));
	const secondaryX = width * (0.72 + 0.11 * Math.cos(phase * 0.71));
	const secondaryY = height * (0.38 + 0.2 * Math.sin(phase * 0.61 + 1.4));

	context.clearRect(0, 0, width, height);
	context.fillStyle = "rgb(33 33 33)";

	const columnCount = Math.ceil(width / gridSpacing) + 2;
	const rowCount = Math.ceil(height / gridSpacing) + 2;
	const offsetX = (width - (columnCount - 1) * gridSpacing) / 2;
	const offsetY = (height - (rowCount - 1) * gridSpacing) / 2;

	for (let row = 0; row < rowCount; row += 1) {
		const y = offsetY + row * gridSpacing;

		for (let column = 0; column < columnCount; column += 1) {
			const x = offsetX + column * gridSpacing;
			const primaryDistance = Math.hypot(
				(x - centerX) / (width * 0.31),
				(y - centerY) / (height * 0.29),
			);
			const secondaryDistance = Math.hypot(
				(x - secondaryX) / (width * 0.34),
				(y - secondaryY) / (height * 0.34),
			);
			const primaryField = 1 - smoothstep(0.08, 1.08, primaryDistance);
			const secondaryField =
				(1 - smoothstep(0.12, 1.14, secondaryDistance)) * 0.36;
			const diagonalWave =
				0.92 +
				0.08 * Math.sin((x + y) * 0.031 - phase * 1.75 + row * 0.08);
			const strength = Math.min(
				1,
				Math.max(primaryField, secondaryField) * diagonalWave,
			);
			const radius =
				restingRadius +
				(peakRadius - restingRadius) * Math.pow(strength, 1.45);

			context.beginPath();
			context.arc(x, y, radius, 0, Math.PI * 2);
			context.fill();
		}
	}

	if (!reducedMotion.matches && !document.hidden) {
		animationFrame = requestAnimationFrame(draw);
	}
};

const restart = () => {
	cancelAnimationFrame(animationFrame);
	startTime = performance.now();
	resize();
	draw(startTime);
};

new ResizeObserver(restart).observe(canvas);
addEventListener("resize", restart);
reducedMotion.addEventListener("change", restart);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) restart();
});

restart();
