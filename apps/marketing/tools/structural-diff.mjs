import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const decode = (strings, index) =>
	typeof index === "number" && index >= 0 ? strings[index] : "";

const attributesForNode = (document, strings, nodeIndex) => {
	const encoded = document.nodes.attributes?.[nodeIndex] ?? [];
	const attributes = {};
	for (let index = 0; index < encoded.length; index += 2) {
		attributes[decode(strings, encoded[index])] = decode(
			strings,
			encoded[index + 1],
		);
	}
	return attributes;
};

const describeNode = (document, strings, nodeIndex) => {
	const name = decode(
		strings,
		document.nodes.nodeName[nodeIndex],
	).toLowerCase();
	const attributes = attributesForNode(document, strings, nodeIndex);
	const marker = attributes.id
		? `#${attributes.id}`
		: attributes.class
			? `.${attributes.class.trim().split(/\s+/).slice(0, 2).join(".")}`
			: "";
	return `${name}${marker}`;
};

const treePaths = (document, strings) => {
	const paths = [];
	const siblingCounts = new Map();
	for (let index = 0; index < document.nodes.nodeName.length; index += 1) {
		const parent = document.nodes.parentIndex[index];
		const name = decode(strings, document.nodes.nodeName[index]).toLowerCase();
		const siblingKey = `${parent}:${name}`;
		const ordinal = siblingCounts.get(siblingKey) ?? 0;
		siblingCounts.set(siblingKey, ordinal + 1);
		const segment = `${name}[${ordinal}]`;
		paths[index] = parent < 0 ? segment : `${paths[parent]}/${segment}`;
	}
	return paths;
};

const normalizeProtocolSnapshot = (capture) => {
	const protocolSnapshot = capture.baseSnapshot ?? capture.snapshot;
	const { strings, documents } = protocolSnapshot;
	const properties = capture.computedStyles;
	const normalizedDocuments = documents.map((document, documentIndex) => {
		const paths = treePaths(document, strings);
		const url = decode(strings, document.documentURL);
		const occurrences = new Map();
		const nodes = new Map();
		const layoutNodes = [];

		for (
			let layoutIndex = 0;
			layoutIndex < document.layout.nodeIndex.length;
			layoutIndex += 1
		) {
			const nodeIndex = document.layout.nodeIndex[layoutIndex];
			const basePath = paths[nodeIndex];
			const occurrence = occurrences.get(basePath) ?? 0;
			occurrences.set(basePath, occurrence + 1);
			const path = occurrence === 0 ? basePath : `${basePath}::${occurrence}`;
			const styles = {};
			if (!capture.styleBatches) {
				const encodedStyles = document.layout.styles?.[layoutIndex] ?? [];
				for (
					let propertyIndex = 0;
					propertyIndex < properties.length;
					propertyIndex += 1
				) {
					styles[properties[propertyIndex]] = decode(
						strings,
						encodedStyles[propertyIndex],
					);
				}
			}
			const bounds = document.layout.bounds?.[layoutIndex] ?? [];
			const normalizedNode = {
				path,
				description: describeNode(document, strings, nodeIndex),
				attributes: attributesForNode(document, strings, nodeIndex),
				bounds: bounds.map((value) => Number(value)),
				styles,
			};
			nodes.set(path, normalizedNode);
			layoutNodes.push(normalizedNode);
		}

		return {
			key: `${url}::${documentIndex}`,
			url,
			nodes,
			layoutNodes,
		};
	});

	if (capture.styleBatches) {
		for (const batch of capture.styleBatches) {
			for (
				let documentIndex = 0;
				documentIndex < batch.documents.length;
				documentIndex += 1
			) {
				const batchDocument = batch.documents[documentIndex];
				const normalizedDocument = normalizedDocuments[documentIndex];
				for (
					let layoutIndex = 0;
					layoutIndex < batchDocument.nodeIndex.length;
					layoutIndex += 1
				) {
					const node = normalizedDocument.layoutNodes[layoutIndex];
					if (!node) continue;
					const encodedStyles = batchDocument.styles?.[layoutIndex] ?? [];
					for (
						let propertyIndex = 0;
						propertyIndex < batch.properties.length;
						propertyIndex += 1
					) {
						node.styles[batch.properties[propertyIndex]] = decode(
							batch.strings,
							encodedStyles[propertyIndex],
						);
					}
				}
			}
		}
	}
	return normalizedDocuments;
};

const closeEnough = (left, right, tolerance) =>
	Number.isFinite(left) &&
	Number.isFinite(right) &&
	Math.abs(left - right) <= tolerance;

export const compareStructures = (
	leftCapture,
	rightCapture,
	{
		geometryTolerance = 0.5,
		rootDescriptions = [],
		excludeDocumentUrls = [],
		viewportOnly = false,
		excludeDescendantsOfAttributes = [],
	} = {},
) => {
	const leftDocuments = normalizeProtocolSnapshot(leftCapture);
	const rightDocuments = normalizeProtocolSnapshot(rightCapture);
	const differences = [];
	const excludedDocuments = [];
	const excludedSubtrees = [];
	const viewport =
		leftCapture.metadata?.viewport ?? rightCapture.metadata?.viewport;
	const intersectsViewport = (node) => {
		if (!viewportOnly || !viewport) return true;
		const [x, y, width, height] = node?.bounds ?? [];
		return (
			Number.isFinite(x) &&
			Number.isFinite(y) &&
			Number.isFinite(width) &&
			Number.isFinite(height) &&
			width > 0 &&
			height > 0 &&
			x < viewport.width &&
			y < viewport.height &&
			x + width > 0 &&
			y + height > 0
		);
	};
	const documentCount = Math.max(leftDocuments.length, rightDocuments.length);

	for (
		let documentIndex = 0;
		documentIndex < documentCount;
		documentIndex += 1
	) {
		const leftDocument = leftDocuments[documentIndex];
		const rightDocument = rightDocuments[documentIndex];
		if (
			excludeDocumentUrls.includes(leftDocument?.url) ||
			excludeDocumentUrls.includes(rightDocument?.url)
		) {
			excludedDocuments.push({
				documentIndex,
				left: leftDocument?.url ?? null,
				right: rightDocument?.url ?? null,
			});
			continue;
		}
		if (!leftDocument || !rightDocument) {
			differences.push({
				type: "document",
				documentIndex,
				left: leftDocument?.url ?? null,
				right: rightDocument?.url ?? null,
			});
			continue;
		}

		const rootPaths = [leftDocument, rightDocument].flatMap((document) =>
			[...document.nodes.entries()]
				.filter(([, node]) =>
					rootDescriptions.some(
						(description) =>
							node.description === description ||
							node.description.startsWith(`${description}.`) ||
							node.description.startsWith(`${description}#`),
					),
				)
				.map(([path]) => path),
		);
		const insideSelectedRoot = (nodePath) =>
			rootDescriptions.length === 0 ||
			rootPaths.some(
				(rootPath) =>
					nodePath === rootPath || nodePath.startsWith(`${rootPath}/`),
			);
		const excludedRoots = [leftDocument, rightDocument].flatMap((document) =>
			[...document.nodes.entries()]
				.filter(([, node]) =>
					excludeDescendantsOfAttributes.some((attribute) =>
						Object.hasOwn(node.attributes, attribute),
					),
				)
				.map(([path, node]) => ({
					path,
					document: document.url,
					node: node.description,
					attributes: excludeDescendantsOfAttributes.filter((attribute) =>
						Object.hasOwn(node.attributes, attribute),
					),
				})),
		);
		excludedSubtrees.push(...excludedRoots);
		const outsideExcludedSubtrees = (nodePath) =>
			!excludedRoots.some(({ path }) => nodePath.startsWith(`${path}/`));
		const paths = new Set(
			[...leftDocument.nodes.keys(), ...rightDocument.nodes.keys()].filter(
				(path) =>
					insideSelectedRoot(path) &&
					outsideExcludedSubtrees(path) &&
					(intersectsViewport(leftDocument.nodes.get(path)) ||
						intersectsViewport(rightDocument.nodes.get(path))),
			),
		);
		for (const path of paths) {
			const leftNode = leftDocument.nodes.get(path);
			const rightNode = rightDocument.nodes.get(path);
			if (!leftNode || !rightNode) {
				differences.push({
					type: "node",
					document: leftDocument.url || rightDocument.url,
					path,
					left: leftNode?.description ?? null,
					right: rightNode?.description ?? null,
				});
				continue;
			}

			for (let index = 0; index < 4; index += 1) {
				const leftValue = leftNode.bounds[index];
				const rightValue = rightNode.bounds[index];
				if (!closeEnough(leftValue, rightValue, geometryTolerance)) {
					differences.push({
						type: "geometry",
						document: leftDocument.url,
						path,
						node: leftNode.description,
						property: ["x", "y", "width", "height"][index],
						left: leftValue,
						right: rightValue,
					});
				}
			}

			for (const property of Object.keys(leftNode.styles)) {
				if (leftNode.styles[property] === rightNode.styles[property]) continue;
				differences.push({
					type: "style",
					document: leftDocument.url,
					path,
					node: leftNode.description,
					property,
					left: leftNode.styles[property],
					right: rightNode.styles[property],
				});
			}
		}
	}

	return {
		leftDocuments: leftDocuments.length,
		rightDocuments: rightDocuments.length,
		excludedDocuments,
		excludedSubtrees: excludedSubtrees.filter(
			(subtree, index, all) =>
				all.findIndex(
					(candidate) =>
						candidate.document === subtree.document &&
						candidate.path === subtree.path,
				) === index,
		),
		viewportOnly,
		viewport: viewport ?? null,
		differenceCount: differences.length,
		differences,
	};
};

const parseArguments = (arguments_) => {
	const options = { positional: [] };
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (!argument.startsWith("--")) options.positional.push(argument);
		else options[argument.slice(2)] = arguments_[++index];
	}
	return options;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const options = parseArguments(process.argv.slice(2));
	const [leftPath, rightPath] = options.positional;
	if (!leftPath || !rightPath) {
		throw new Error(
			"Usage: node tools/structural-diff.mjs <left.json> <right.json> [--output report.json] [--tolerance 0.5]",
		);
	}
	const [left, right] = await Promise.all([
		readFile(leftPath, "utf8").then(JSON.parse),
		readFile(rightPath, "utf8").then(JSON.parse),
	]);
	const result = compareStructures(left, right, {
		geometryTolerance: Number(options.tolerance ?? 0.5),
	});
	if (options.output) {
		await mkdir(path.dirname(options.output), { recursive: true });
		await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
	}
	console.log(JSON.stringify(result, null, 2));
	if (result.differenceCount > 0) process.exitCode = 1;
}
