import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const parseArguments = (arguments_) => {
	const options = { positional: [] };
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (!argument.startsWith("--")) {
			options.positional.push(argument);
			continue;
		}
		const key = argument.slice(2);
		if (key === "exact") options.exact = true;
		else options[key] = arguments_[++index];
	}
	return options;
};

const loadPng = async (path) => PNG.sync.read(await readFile(path));

const insideMask = (x, y, masks) =>
	masks.some(
		(mask) =>
			x >= mask.x &&
			x < mask.x + mask.width &&
			y >= mask.y &&
			y < mask.y + mask.height,
	);

const maskedByPng = (x, y, masks) =>
	masks.some((mask) => {
		const offset = (y * mask.width + x) * 4;
		return mask.data[offset] > 127;
	});

export const comparePngs = async ({
	leftPath,
	rightPath,
	diffPath,
	masks = [],
	maskPngPaths = [],
	exact = false,
	threshold = 0.1,
}) => {
	const [left, right] = await Promise.all([
		loadPng(leftPath),
		loadPng(rightPath),
	]);
	const maskPngs = await Promise.all(maskPngPaths.map(loadPng));
	if (left.width !== right.width || left.height !== right.height) {
		throw new Error(
			`Image dimensions differ: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
		);
	}
	for (const mask of maskPngs) {
		if (mask.width !== left.width || mask.height !== left.height) {
			throw new Error("Pixel-mask dimensions do not match the compared images");
		}
	}

	const first = PNG.sync.read(PNG.sync.write(left));
	const second = PNG.sync.read(PNG.sync.write(right));
	let comparedPixels = left.width * left.height;
	for (let y = 0; y < left.height; y += 1) {
		for (let x = 0; x < left.width; x += 1) {
			if (!insideMask(x, y, masks) && !maskedByPng(x, y, maskPngs)) {
				continue;
			}
			comparedPixels -= 1;
			const offset = (y * left.width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				second.data[offset + channel] = first.data[offset + channel];
			}
		}
	}

	const diff = new PNG({ width: left.width, height: left.height });
	const differingPixels = pixelmatch(
		first.data,
		second.data,
		diff.data,
		left.width,
		left.height,
		{
			threshold: exact ? 0 : threshold,
			includeAA: exact,
		},
	);
	const diffPercent =
		comparedPixels === 0 ? 0 : (differingPixels / comparedPixels) * 100;

	if (diffPath) {
		await mkdir(path.dirname(diffPath), { recursive: true });
		await writeFile(diffPath, PNG.sync.write(diff));
	}

	return {
		width: left.width,
		height: left.height,
		comparedPixels,
		differingPixels,
		diffPercent,
	};
};

export const createDifferenceMask = async ({
	paintedPath,
	unpaintedPath,
	outputPath,
	channelTolerance = 2,
	dilationRadius = 0,
}) => {
	const [painted, unpainted] = await Promise.all([
		loadPng(paintedPath),
		loadPng(unpaintedPath),
	]);
	if (
		painted.width !== unpainted.width ||
		painted.height !== unpainted.height
	) {
		throw new Error("Canvas-mask source dimensions differ");
	}
	const mask = new PNG({ width: painted.width, height: painted.height });
	let maskedPixels = 0;
	for (let offset = 0; offset < painted.data.length; offset += 4) {
		let differs = false;
		for (let channel = 0; channel < 4; channel += 1) {
			if (
				Math.abs(
					painted.data[offset + channel] - unpainted.data[offset + channel],
				) > channelTolerance
			) {
				differs = true;
				break;
			}
		}
		const value = differs ? 255 : 0;
		mask.data[offset] = value;
		mask.data[offset + 1] = value;
		mask.data[offset + 2] = value;
		mask.data[offset + 3] = 255;
		if (differs) maskedPixels += 1;
	}
	if (dilationRadius > 0) {
		const source = Buffer.from(mask.data);
		for (let y = 0; y < mask.height; y += 1) {
			for (let x = 0; x < mask.width; x += 1) {
				const offset = (y * mask.width + x) * 4;
				if (source[offset] <= 127) continue;
				for (
					let targetY = Math.max(0, y - dilationRadius);
					targetY <= Math.min(mask.height - 1, y + dilationRadius);
					targetY += 1
				) {
					for (
						let targetX = Math.max(0, x - dilationRadius);
						targetX <= Math.min(mask.width - 1, x + dilationRadius);
						targetX += 1
					) {
						const targetOffset = (targetY * mask.width + targetX) * 4;
						mask.data[targetOffset] = 255;
						mask.data[targetOffset + 1] = 255;
						mask.data[targetOffset + 2] = 255;
						mask.data[targetOffset + 3] = 255;
					}
				}
			}
		}
		maskedPixels = 0;
		for (let offset = 0; offset < mask.data.length; offset += 4) {
			if (mask.data[offset] > 127) maskedPixels += 1;
		}
	}
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, PNG.sync.write(mask));
	return {
		width: painted.width,
		height: painted.height,
		maskedPixels,
		maskedPercent: (maskedPixels / (painted.width * painted.height)) * 100,
		dilationRadius,
	};
};

export const imageHistogram = async (path, region) => {
	const image = await loadPng(path);
	const bounds = {
		x: Math.max(0, Math.floor(region?.x ?? 0)),
		y: Math.max(0, Math.floor(region?.y ?? 0)),
		width: Math.min(image.width, Math.ceil(region?.width ?? image.width)),
		height: Math.min(image.height, Math.ceil(region?.height ?? image.height)),
	};
	const buckets = new Set();
	let count = 0;
	let nonWhite = 0;
	let sum = 0;
	let sumSquares = 0;
	let minimum = 255;
	let maximum = 0;

	for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
		for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
			const offset = (y * image.width + x) * 4;
			const red = image.data[offset];
			const green = image.data[offset + 1];
			const blue = image.data[offset + 2];
			const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
			minimum = Math.min(minimum, luminance);
			maximum = Math.max(maximum, luminance);
			sum += luminance;
			sumSquares += luminance * luminance;
			count += 1;
			if (red < 248 || green < 248 || blue < 248) nonWhite += 1;
			buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
		}
	}

	const mean = sum / count;
	const standardDeviation = Math.sqrt(
		Math.max(0, sumSquares / count - mean * mean),
	);
	return {
		pixels: count,
		quantizedColors: buckets.size,
		nonWhitePercent: (nonWhite / count) * 100,
		minimum,
		maximum,
		dynamicRange: maximum - minimum,
		standardDeviation,
	};
};

export const assertNonBlank = (
	histogram,
	label,
	{
		minimumQuantizedColors = 8,
		minimumNonWhitePercent = 0.2,
		minimumDynamicRange = 16,
		minimumStandardDeviation = 1.5,
	} = {},
) => {
	if (
		histogram.quantizedColors < minimumQuantizedColors ||
		histogram.nonWhitePercent < minimumNonWhitePercent ||
		histogram.dynamicRange < minimumDynamicRange ||
		histogram.standardDeviation < minimumStandardDeviation
	) {
		throw new Error(
			`${label} failed the non-blank histogram check: ${JSON.stringify(histogram)}`,
		);
	}
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const options = parseArguments(process.argv.slice(2));
	const [leftPath, rightPath] = options.positional;
	if (!leftPath || !rightPath) {
		throw new Error(
			"Usage: node tools/diff.mjs <left.png> <right.png> [--output diff.png] [--mask masks.json] [--max-diff-pct 0.1] [--exact]",
		);
	}
	const masks = options.mask
		? JSON.parse(await readFile(options.mask, "utf8"))
		: [];
	const maskPngPaths = options["mask-png"]
		? options["mask-png"].split(",")
		: [];
	const result = await comparePngs({
		leftPath,
		rightPath,
		diffPath: options.output,
		masks,
		maskPngPaths,
		exact: options.exact,
	});
	console.log(JSON.stringify(result, null, 2));
	const maximum = Number(options["max-diff-pct"] ?? (options.exact ? 0 : 0.1));
	if (result.diffPercent > maximum) process.exitCode = 1;
}
