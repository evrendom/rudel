const surface = document.querySelector(
	'[data-testid="image-gen-loading-state"]',
);
const canvas = document.querySelector(
	'[data-testid="image-gen-loading-state-dots"] canvas',
);

if (!(surface instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
	throw new Error("Missing image generation loading surface.");
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
const pointer = {
	active: false,
	currentX: 480 * 0.33,
	currentY: 480 * 0.55,
	targetX: 480 * 0.33,
	targetY: 480 * 0.55,
};
let width = 480;
let height = 480;
let pixelRatio = 2;
let animationFrame = 0;
let startTime = performance.now();
let previousTime = startTime;

const resize = () => {
	const bounds = canvas.getBoundingClientRect();
	const previousWidth = width;
	const previousHeight = height;
	width = bounds.width;
	height = bounds.height;
	pixelRatio = Math.min(devicePixelRatio || 1, 2);
	const bitmapWidth = Math.max(1, Math.round(width * pixelRatio));
	const bitmapHeight = Math.max(1, Math.round(height * pixelRatio));

	if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
		canvas.width = bitmapWidth;
		canvas.height = bitmapHeight;
	}

	if (previousWidth > 0 && previousHeight > 0) {
		pointer.currentX *= width / previousWidth;
		pointer.currentY *= height / previousHeight;
		pointer.targetX *= width / previousWidth;
		pointer.targetY *= height / previousHeight;
	} else {
		pointer.currentX = width * 0.33;
		pointer.currentY = height * 0.55;
		pointer.targetX = pointer.currentX;
		pointer.targetY = pointer.currentY;
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

const setPointerTarget = (event) => {
	const bounds = surface.getBoundingClientRect();
	pointer.targetX = Math.min(width, Math.max(0, event.clientX - bounds.left));
	pointer.targetY = Math.min(height, Math.max(0, event.clientY - bounds.top));

	if (reducedMotion.matches) {
		pointer.currentX = pointer.targetX;
		pointer.currentY = pointer.targetY;
		draw(performance.now());
	}
};

const enterPointer = (event) => {
	pointer.active = true;
	setPointerTarget(event);
};

const leavePointer = (event) => {
	if (event.pointerType !== "touch") pointer.active = false;
	if (reducedMotion.matches) draw(performance.now());
};

const draw = (time) => {
	const currentPixelRatio = Math.min(devicePixelRatio || 1, 2);
	if (currentPixelRatio !== pixelRatio) resize();

	const elapsed = reducedMotion.matches ? 0 : time - startTime;
	const phase = (elapsed / cycleDuration) * Math.PI * 2;
	const idleX = width * (0.33 + 0.22 * Math.sin(phase));
	const idleY = height * (0.55 + 0.17 * Math.sin(phase * 0.83 - 0.25));
	const destinationX = pointer.active ? pointer.targetX : idleX;
	const destinationY = pointer.active ? pointer.targetY : idleY;
	const deltaTime = Math.min(64, Math.max(0, time - previousTime));
	const followStrength = reducedMotion.matches
		? 1
		: 1 - Math.exp(-deltaTime / (pointer.active ? 72 : 240));
	pointer.currentX += (destinationX - pointer.currentX) * followStrength;
	pointer.currentY += (destinationY - pointer.currentY) * followStrength;
	previousTime = time;

	const secondaryX = pointer.active
		? pointer.currentX + (idleX - pointer.currentX) * 0.42
		: width * (0.72 + 0.11 * Math.cos(phase * 0.71));
	const secondaryY = pointer.active
		? pointer.currentY + (idleY - pointer.currentY) * 0.42
		: height * (0.38 + 0.2 * Math.sin(phase * 0.61 + 1.4));

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
				(x - pointer.currentX) / (width * 0.31),
				(y - pointer.currentY) / (height * 0.29),
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
	previousTime = startTime;
	resize();
	draw(startTime);
};

surface.addEventListener("pointerenter", enterPointer);
surface.addEventListener("pointermove", setPointerTarget);
surface.addEventListener("pointerleave", leavePointer);
surface.addEventListener("pointerdown", (event) => {
	pointer.active = true;
	surface.setPointerCapture?.(event.pointerId);
	setPointerTarget(event);
});
surface.addEventListener("pointerup", (event) => {
	if (event.pointerType === "touch") pointer.active = false;
	surface.releasePointerCapture?.(event.pointerId);
	if (reducedMotion.matches) draw(performance.now());
});
surface.addEventListener("pointercancel", () => {
	pointer.active = false;
	if (reducedMotion.matches) draw(performance.now());
});

new ResizeObserver(restart).observe(canvas);
addEventListener("resize", restart);
reducedMotion.addEventListener("change", restart);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) restart();
});

restart();
