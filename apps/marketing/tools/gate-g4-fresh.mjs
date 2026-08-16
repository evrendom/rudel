import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { comparePngs } from "./diff.mjs";

const root = path.resolve(
	process.env.OPALINE_G4_ROOT ?? ".context/gates/g4-fresh-20260810-1210",
);
const referenceRoot = path.join(root, "reference");
const candidateRoot = path.join(root, "candidate");
const diffRoot = path.join(root, "diff");
const [referenceMatrix, candidateMatrix] = await Promise.all([
	readFile(path.join(referenceRoot, "matrix.json"), "utf8").then(JSON.parse),
	readFile(path.join(candidateRoot, "matrix.json"), "utf8").then(JSON.parse),
]);
const referenceByKey = new Map(
	referenceMatrix.shots.map((shot) => [`${shot.viewport}:${shot.state}`, shot]),
);
const candidateByKey = new Map(
	candidateMatrix.shots.map((shot) => [`${shot.viewport}:${shot.state}`, shot]),
);
const allKeys = [
	...new Set([...referenceByKey.keys(), ...candidateByKey.keys()]),
].sort();

const authorizationFor = (state) => {
	if (state === "footer") return ["D004"];
	if (state === "auxiliary-window-dragged")
		return ["D001", "D002", "D003", "D005"];
	if (state.startsWith("section-")) return [];
	if (state === "aperture-mid") return [];
	if (state === "js-disabled-reference-raw")
		return ["reference-only raw no-JS diagnostic"];
	if (state.startsWith("use-case-")) return ["D001", "D002", "D003"];
	return ["D001", "D002", "D003"];
};
const r6For = (state) =>
	[
		"top",
		"hero-focus",
		"hero-end",
		"button-hover",
		"focus-visible",
		"reduced-motion",
		"js-disabled",
		"navbar-product-open",
		"navbar-resources-open",
		"navbar-item-hover",
		"navbar-switch-mid",
		"mobile-menu-open",
		"use-case-data",
		"use-case-reporting",
	].includes(state)
		? "dashboard auxiliary-window entrance/timing residual"
		: null;

await mkdir(diffRoot, { recursive: true });
const results = [];
for (const key of allKeys) {
	const reference = referenceByKey.get(key);
	const candidate = candidateByKey.get(key);
	if (!reference || !candidate) {
		results.push({
			key,
			missing: { reference: !reference, candidate: !candidate },
		});
		continue;
	}
	const pixel = await comparePngs({
		leftPath: path.join(referenceRoot, reference.filename),
		rightPath: path.join(candidateRoot, candidate.filename),
		diffPath: path.join(diffRoot, reference.filename),
		exact: false,
	});
	results.push({
		key,
		viewport: reference.viewport,
		state: reference.state,
		reference: reference.filename,
		candidate: candidate.filename,
		pixel,
		sanctionedDivergences: authorizationFor(reference.state),
		r6Residual: r6For(reference.state),
		strictPass: pixel.diffPercent <= 0.1,
	});
}

const comparable = results.filter((result) => result.pixel);
const byState = Object.values(
	Object.groupBy(comparable, (result) => result.state),
)
	.map((stateResults) => ({
		state: stateResults[0].state,
		maximumDiffPercent: Math.max(
			...stateResults.map((result) => result.pixel.diffPercent),
		),
		meanDiffPercent:
			stateResults.reduce((sum, result) => sum + result.pixel.diffPercent, 0) /
			stateResults.length,
		strictPassCount: stateResults.filter((result) => result.strictPass).length,
		count: stateResults.length,
		sanctionedDivergences: stateResults[0].sanctionedDivergences,
		r6Residual: stateResults[0].r6Residual,
	}))
	.sort((left, right) => left.state.localeCompare(right.state));
const sectionResults = comparable.filter((result) =>
	result.state.startsWith("section-"),
);
const unapprovedFailures = comparable.filter(
	(result) =>
		!result.strictPass &&
		result.sanctionedDivergences.length === 0 &&
		!result.r6Residual,
);
const r6Failures = comparable.filter(
	(result) => !result.strictPass && result.r6Residual,
);
const report = {
	gate: "G4-fresh-full-page-matrix",
	generatedAt: new Date().toISOString(),
	artifactRoot: root,
	referenceCapturedAt: referenceMatrix.capturedAt,
	candidateCapturedAt: candidateMatrix.capturedAt,
	thresholds: { maximumPixelDifferencePercent: 0.1 },
	structuralTier: {
		strategy:
			"component structural gates + full-page paint matrix; the reference iframe tree and owned Astro DOM are intentionally not isomorphic",
		componentReports: [
			".context/gates/navbar/g2/report.json",
			".context/gates/hero-title/g2/report.json",
			".context/gates/dashboard/g2/report.json",
			".context/gates/lens-content/g2/report.json",
			".context/gates/hero-canvas/g1/report.json",
		],
	},
	shotCounts: {
		reference: referenceMatrix.shots.length,
		candidate: candidateMatrix.shots.length,
		compared: comparable.length,
		missing: results.length - comparable.length,
	},
	sectionSummary: {
		count: sectionResults.length,
		maximumDiffPercent: Math.max(
			...sectionResults.map((result) => result.pixel.diffPercent),
		),
		strictPassCount: sectionResults.filter((result) => result.strictPass)
			.length,
	},
	strictPassed:
		comparable.every((result) => result.strictPass) &&
		results.length === comparable.length,
	passed:
		unapprovedFailures.length === 0 &&
		r6Failures.length === 0 &&
		results.length === comparable.length,
	blockedByR6: r6Failures.length > 0,
	unapprovedFailureCount: unapprovedFailures.length,
	r6FailureCount: r6Failures.length,
	byState,
	results,
};
await writeFile(
	path.join(root, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			artifactRoot: root,
			shotCounts: report.shotCounts,
			strictPassed: report.strictPassed,
			passed: report.passed,
			blockedByR6: report.blockedByR6,
			unapprovedFailureCount: report.unapprovedFailureCount,
			r6FailureCount: report.r6FailureCount,
			sectionSummary: report.sectionSummary,
		},
		null,
		2,
	),
);
