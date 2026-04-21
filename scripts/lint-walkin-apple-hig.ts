import { readFileSync } from "node:fs";
import { join } from "node:path";

interface AuditFile {
	content: string;
	lines: string[];
	relativePath: string;
}

interface Finding {
	excerpt?: string;
	line: number | null;
	message: string;
	relativePath: string;
	rule: string;
}

const ROOT_DIR = join(import.meta.dirname, "..");
const WALK_IN_ONBOARDING_PATH =
	"apps/web/src/features/walk-in/team-card-walk-in-onboarding.tsx";
const WALK_IN_CSS_PATH = "apps/web/src/features/walk-in/walk-in-clone.css";
const BUTTON_PATH = "apps/web/src/app/ui/button.tsx";

function main() {
	const auditFiles = loadAuditFiles([
		WALK_IN_ONBOARDING_PATH,
		WALK_IN_CSS_PATH,
		BUTTON_PATH,
	]);
	const findings: Finding[] = [];

	runWalkInHeightRules(auditFiles, findings);
	runSafeAreaRule(auditFiles, findings);
	runStepCountRule(auditFiles, findings);
	runProgressTargetRule(auditFiles, findings);
	runFooterButtonTargetRule(auditFiles, findings);
	runKeyboardOnlyHintRule(auditFiles, findings);
	runOverflowRule(auditFiles, findings);

	if (findings.length === 0) {
		console.log("Apple HIG walk-in audit passed.");
		return;
	}

	console.error("Apple HIG walk-in audit failed.");
	console.error("");

	for (const finding of findings) {
		const location =
			finding.line === null
				? finding.relativePath
				: `${finding.relativePath}:${finding.line}`;

		console.error(`[${finding.rule}] ${location}`);
		console.error(`  ${finding.message}`);

		if (finding.excerpt) {
			console.error(`  ${finding.excerpt}`);
		}

		console.error("");
	}

	process.exit(1);
}

function loadAuditFiles(relativePaths: readonly string[]) {
	return relativePaths.map((relativePath) => {
		const absolutePath = join(ROOT_DIR, relativePath);
		const content = readFileSync(absolutePath, "utf-8");

		return {
			content,
			lines: content.split("\n"),
			relativePath,
		} satisfies AuditFile;
	});
}

function runWalkInHeightRules(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInOnboardingFile = getAuditFile(auditFiles, WALK_IN_ONBOARDING_PATH);
	const walkInCssFile = getAuditFile(auditFiles, WALK_IN_CSS_PATH);

	addLineFindings({
		auditFile: walkInOnboardingFile,
		findings,
		message:
			"Use `100svh`-based route sizing for the walk-in deck instead of `min-h-screen` so iPhone browser chrome and safe areas do not crop the story.",
		pattern: /min-h-screen/g,
		rule: "walkin-height",
	});

	addLineFindings({
		auditFile: walkInCssFile,
		findings,
		message:
			"Replace `100vh` with `100svh` (or an equivalent safe viewport unit) for the walk-in shell and root container.",
		pattern: /100vh/g,
		rule: "walkin-height",
	});

	if (!containsPattern(auditFiles, /100svh|svh/g)) {
		findings.push({
			line: null,
			message:
				"The walk-in route does not use `svh` anywhere. Apple-style full-screen mobile layouts should be sized against the safe viewport, not the legacy viewport height.",
			relativePath: WALK_IN_CSS_PATH,
			rule: "walkin-height",
		});
	}
}

function runSafeAreaRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	if (containsPattern(auditFiles, /safe-area-inset|env\(/g)) {
		return;
	}

	findings.push({
		line: null,
		message:
			"The walk-in route does not reference safe-area insets. Add `env(safe-area-inset-*)` padding to the shell so controls and story content clear the notch, rounded corners, and home indicator.",
		relativePath: WALK_IN_CSS_PATH,
		rule: "safe-area",
	});
}

function runStepCountRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInOnboardingFile = getAuditFile(auditFiles, WALK_IN_ONBOARDING_PATH);
	const walkInStepsSection = getSection(
		walkInOnboardingFile.content,
		"const WALK_IN_STEPS = [",
		"] as const;",
	);
	const configuredStepCount = (walkInStepsSection.match(/id:\s*"/g) ?? []).length;
	const hiddenLeadingSteps = walkInOnboardingFile.content.includes(
		"WALK_IN_STEPS.slice(1)",
	)
		? 1
		: 0;
	const stepCount = Math.max(0, configuredStepCount - hiddenLeadingSteps);

	if (stepCount <= 10) {
		return;
	}

	findings.push({
		excerpt: `Detected ${stepCount} visible step indicators.`,
		line: getLineNumber(
			walkInOnboardingFile,
			/const WALK_IN_STEPS = \[/,
		),
		message:
			"Apple notes that page controls become hard to parse when they exceed about 10 indicators. Reduce the visible walk-in steps or split the deck into smaller chapters.",
		relativePath: walkInOnboardingFile.relativePath,
		rule: "page-control-count",
	});
}

function runProgressTargetRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInOnboardingFile = getAuditFile(auditFiles, WALK_IN_ONBOARDING_PATH);

	addLineFindings({
		auditFile: walkInOnboardingFile,
		findings,
		message:
			"The progress step buttons use `size-8` (`32px`). Apple's touch target guidance is `44x44pt` minimum, so keep the visible dot small if you want, but wrap it in a `44px` tap box.",
		pattern: /size-8 rounded-full/g,
		rule: "touch-target",
	});
}

function runFooterButtonTargetRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInOnboardingFile = getAuditFile(auditFiles, WALK_IN_ONBOARDING_PATH);
	const buttonFile = getAuditFile(auditFiles, BUTTON_PATH);
	const walkInUsesLargeButtons = walkInOnboardingFile.content.includes(
		'buttonVariants({ size: "lg"',
	);
	const largeButtonIsFortyPixels = buttonFile.content.includes('lg: "h-10');

	if (!walkInUsesLargeButtons || !largeButtonIsFortyPixels) {
		return;
	}

	findings.push({
		excerpt:
			'Walk-in footer uses `buttonVariants({ size: "lg" })`, and the shared `lg` button size currently resolves to `h-10` (`40px`).',
		line: getLineNumber(
			walkInOnboardingFile,
			/buttonVariants\(\{ size: "lg"/,
		),
		message:
			"Footer navigation buttons are under Apple's `44pt` target. Use a walk-in-specific control size or raise the shared `lg` size before relying on it for mobile story navigation.",
		relativePath: walkInOnboardingFile.relativePath,
		rule: "touch-target",
	});
}

function runKeyboardOnlyHintRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInOnboardingFile = getAuditFile(auditFiles, WALK_IN_ONBOARDING_PATH);

	addLineFindings({
		auditFile: walkInOnboardingFile,
		findings,
		message:
			"The walk-in copy assumes keyboard navigation. For a phone-first story route, the hint should mention tap or swipe first, with keyboard as a secondary affordance.",
		pattern: /Use arrow keys/g,
		rule: "mobile-affordance",
	});
}

function runOverflowRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const walkInCssFile = getAuditFile(auditFiles, WALK_IN_CSS_PATH);

	addLineFindings({
		auditFile: walkInCssFile,
		findings,
		message:
			"`overflow: hidden` on the walk-in body or route can block large-text fallback scrolling. For Apple-style mobile resilience, allow the page or individual slides to scroll when content outgrows the viewport.",
		pattern: /overflow:\s*hidden/g,
		rule: "dynamic-type",
	});
}

function addLineFindings(input: {
	auditFile: AuditFile;
	findings: Finding[];
	message: string;
	pattern: RegExp;
	rule: string;
}) {
	const { auditFile, findings, message, pattern, rule } = input;

	for (const match of matchLines(auditFile, pattern)) {
		findings.push({
			excerpt: match.excerpt,
			line: match.line,
			message,
			relativePath: auditFile.relativePath,
			rule,
		});
	}
}

function matchLines(auditFile: AuditFile, pattern: RegExp) {
	const matches: Array<{ excerpt: string; line: number }> = [];

	for (const [index, line] of auditFile.lines.entries()) {
		pattern.lastIndex = 0;

		if (!pattern.test(line)) {
			continue;
		}

		matches.push({
			excerpt: line.trim(),
			line: index + 1,
		});
	}

	return matches;
}

function containsPattern(auditFiles: readonly AuditFile[], pattern: RegExp) {
	for (const auditFile of auditFiles) {
		pattern.lastIndex = 0;

		if (pattern.test(auditFile.content)) {
			return true;
		}
	}

	return false;
}

function getAuditFile(auditFiles: readonly AuditFile[], relativePath: string) {
	const auditFile = auditFiles.find((candidate) => {
		return candidate.relativePath === relativePath;
	});

	if (!auditFile) {
		throw new Error(`Missing audit file: ${relativePath}`);
	}

	return auditFile;
}

function getLineNumber(auditFile: AuditFile, pattern: RegExp) {
	for (const [index, line] of auditFile.lines.entries()) {
		pattern.lastIndex = 0;

		if (pattern.test(line)) {
			return index + 1;
		}
	}

	return null;
}

function getSection(content: string, startMarker: string, endMarker: string) {
	const startIndex = content.indexOf(startMarker);
	const endIndex = content.indexOf(endMarker, startIndex);

	if (startIndex === -1 || endIndex === -1) {
		return "";
	}

	return content.slice(startIndex, endIndex + endMarker.length);
}

main();
