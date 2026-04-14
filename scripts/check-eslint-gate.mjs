import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const baselinePath = path.resolve(process.cwd(), ".eslint-baseline.json");
const eslintBinary = path.resolve(process.cwd(), "node_modules", ".bin", "eslint");
const shouldWriteBaseline = process.argv.includes("--write-baseline");

function runEslint() {
	const result = spawnSync(eslintBinary, [".", "-f", "json"], {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});

	if (result.status !== 0 && result.status !== 1) {
		throw new Error(
			result.stderr || result.error?.message || "ESLint failed to execute.",
		);
	}

	return JSON.parse(result.stdout);
}

function toSignature(relativePath, message) {
	return [
		relativePath,
		message.ruleId ?? "unknown",
		normalizeMessage(message.message),
	].join("|");
}

function normalizeMessage(message) {
	return message.replace(/\d+/g, "#");
}

function collectCounts(report) {
	const counts = {};

	for (const file of report) {
		const relativePath = path.relative(process.cwd(), file.filePath);

		for (const message of file.messages) {
			if (message.severity !== 2) {
				continue;
			}

			const signature = toSignature(relativePath, message);
			counts[signature] = (counts[signature] ?? 0) + 1;
		}
	}

	return counts;
}

function collectWarnings(report) {
	const warnings = [];

	for (const file of report) {
		const relativePath = path.relative(process.cwd(), file.filePath);
		for (const message of file.messages) {
			if (message.severity !== 1) {
				continue;
			}

			warnings.push({
				relativePath,
				line: message.line,
				column: message.column,
				ruleId: message.ruleId ?? "unknown",
				message: message.message,
			});
		}
	}

	return warnings;
}

function loadBaseline() {
	try {
		return JSON.parse(readFileSync(baselinePath, "utf8"));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return {};
		}

		throw error;
	}
}

function writeBaseline(counts) {
	const orderedEntries = Object.entries(counts).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	writeFileSync(
		baselinePath,
		`${JSON.stringify(Object.fromEntries(orderedEntries), null, "\t")}\n`,
	);
}

function main() {
	const report = runEslint();
	const counts = collectCounts(report);
	const warnings = collectWarnings(report);

	if (shouldWriteBaseline) {
		writeBaseline(counts);
		console.log(
			`Wrote ESLint baseline with ${Object.keys(counts).length} signatures to ${path.basename(baselinePath)}.`,
		);
		return;
	}

	const baseline = loadBaseline();
	const regressions = [];

	for (const [signature, currentCount] of Object.entries(counts)) {
		const baselineCount = baseline[signature] ?? 0;
		if (currentCount > baselineCount) {
			regressions.push({
				signature,
				excessCount: currentCount - baselineCount,
			});
		}
	}

	if (warnings.length > 0) {
		console.warn("ESLint warnings:");
		for (const warning of warnings) {
			console.warn(
				`${warning.relativePath}:${warning.line}:${warning.column} ${warning.ruleId} ${warning.message}`,
			);
		}
	}

	if (regressions.length === 0) {
		console.log("ESLint gate passed.");
		return;
	}

	console.error("New ESLint violations exceed the tracked baseline:");
	for (const regression of regressions) {
		const [relativePath, ruleId, message] = regression.signature.split("|");
		console.error(
			`${relativePath} ${ruleId} (+${regression.excessCount}) ${message}`,
		);
	}

	process.exitCode = 1;
}

main();
