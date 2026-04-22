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
const WRAPPED_ONBOARDING_SHELL_PATH =
	"apps/web/src/features/wrapped/onboarding/shell.tsx";
const WRAPPED_ONBOARDING_CONFIG_PATH =
	"apps/web/src/features/wrapped/onboarding/config.ts";
const WRAPPED_CSS_PATH = "apps/web/src/features/wrapped/wrapped.css";
const BUTTON_PATH = "apps/web/src/app/ui/button.tsx";

function main() {
	const auditFiles = loadAuditFiles([
		WRAPPED_ONBOARDING_SHELL_PATH,
		WRAPPED_ONBOARDING_CONFIG_PATH,
		WRAPPED_CSS_PATH,
		BUTTON_PATH,
	]);
	const findings: Finding[] = [];

	runWrappedHeightRules(auditFiles, findings);
	runSafeAreaRule(auditFiles, findings);
	runStepCountRule(auditFiles, findings);
	runProgressTargetRule(auditFiles, findings);
	runFooterButtonTargetRule(auditFiles, findings);
	runKeyboardOnlyHintRule(auditFiles, findings);
	runOverflowRule(auditFiles, findings);

	if (findings.length === 0) {
		console.log("Apple HIG wrapped audit passed.");
		return;
	}

	console.error("Apple HIG wrapped audit failed.");
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

function runWrappedHeightRules(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedOnboardingFile = getAuditFile(
		auditFiles,
		WRAPPED_ONBOARDING_SHELL_PATH,
	);
	const wrappedCssFile = getAuditFile(auditFiles, WRAPPED_CSS_PATH);

	addLineFindings({
		auditFile: wrappedOnboardingFile,
		findings,
		message:
			"Use `100svh`-based route sizing for the wrapped deck instead of `min-h-screen` so iPhone browser chrome and safe areas do not crop the story.",
		pattern: /min-h-screen/g,
		rule: "wrapped-height",
	});

	addLineFindings({
		auditFile: wrappedCssFile,
		findings,
		message:
			"Replace `100vh` with `100svh` (or an equivalent safe viewport unit) for the wrapped shell and root container.",
		pattern: /100vh/g,
		rule: "wrapped-height",
	});

	if (!containsPattern(auditFiles, /100svh|svh/g)) {
		findings.push({
			line: null,
			message:
				"The wrapped route does not use `svh` anywhere. Apple-style full-screen mobile layouts should be sized against the safe viewport, not the legacy viewport height.",
			relativePath: WRAPPED_CSS_PATH,
			rule: "wrapped-height",
		});
	}
}

function runSafeAreaRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedCssFile = getAuditFile(auditFiles, WRAPPED_CSS_PATH);
	const usesSafeAreaInsets = containsPattern(auditFiles, /safe-area-inset|env\(/g);

	if (!usesSafeAreaInsets) {
		findings.push({
			line: null,
			message:
				"The wrapped route does not reference safe-area insets. Add `env(safe-area-inset-*)` padding to the shell so controls and story content clear the notch, rounded corners, and home indicator.",
			relativePath: WRAPPED_CSS_PATH,
			rule: "safe-area",
		});
		return;
	}

	addLineFindings({
		auditFile: wrappedCssFile,
		findings,
		message:
			"Do not use `max(baseline, env(safe-area-inset-*))` for wrapped shell padding. Apple-style mobile shells need a baseline gutter plus the safe-area inset, not one or the other.",
		pattern: /max\([^)]*safe-area-inset[^)]*\)/g,
		rule: "safe-area",
	});

	const usesAdditiveSafeAreaPadding =
		/padding-(top|right|bottom|left):\s*calc\(\s*env\(safe-area-inset-(top|right|bottom|left),?\s*0px\)\s*\+/.test(
			wrappedCssFile.content,
		);

	if (usesAdditiveSafeAreaPadding) {
		return;
	}

	findings.push({
		line: null,
		message:
			"The wrapped shell should use additive safe-area padding such as `calc(env(safe-area-inset-bottom, 0px) + 16px)` so content keeps both the device-safe inset and a readable gutter.",
		relativePath: WRAPPED_CSS_PATH,
		rule: "safe-area",
	});
}

function runStepCountRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedOnboardingConfigFile = getAuditFile(
		auditFiles,
		WRAPPED_ONBOARDING_CONFIG_PATH,
	);
	const wrappedStepsSection = getSection(
		wrappedOnboardingConfigFile.content,
		"const WRAPPED_STEPS = [",
		"] as const;",
	);
	const configuredStepCount = (wrappedStepsSection.match(/id:\s*"/g) ?? []).length;
	const hiddenLeadingSteps = wrappedOnboardingConfigFile.content.includes(
		"WRAPPED_STEPS.slice(1)",
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
			wrappedOnboardingConfigFile,
			/const WRAPPED_STEPS = \[/,
		),
		message:
			"Apple notes that page controls become hard to parse when they exceed about 10 indicators. Reduce the visible wrapped steps or split the deck into smaller chapters.",
		relativePath: wrappedOnboardingConfigFile.relativePath,
		rule: "page-control-count",
	});
}

function runProgressTargetRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedOnboardingFile = getAuditFile(
		auditFiles,
		WRAPPED_ONBOARDING_SHELL_PATH,
	);

	addLineFindings({
		auditFile: wrappedOnboardingFile,
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
	const wrappedOnboardingFile = getAuditFile(
		auditFiles,
		WRAPPED_ONBOARDING_SHELL_PATH,
	);
	const buttonFile = getAuditFile(auditFiles, BUTTON_PATH);
	const wrappedUsesLargeButtons = wrappedOnboardingFile.content.includes(
		'buttonVariants({ size: "lg"',
	);
	const largeButtonIsFortyPixels = buttonFile.content.includes('lg: "h-10');

	if (!wrappedUsesLargeButtons || !largeButtonIsFortyPixels) {
		return;
	}

		findings.push({
			excerpt:
				'Wrapped footer uses `buttonVariants({ size: "lg" })`, and the shared `lg` button size currently resolves to `h-10` (`40px`).',
			line: getLineNumber(
				wrappedOnboardingFile,
				/buttonVariants\(\{ size: "lg"/,
		),
		message:
			"Footer navigation buttons are under Apple's `44pt` target. Use a wrapped-specific control size or raise the shared `lg` size before relying on it for mobile story navigation.",
		relativePath: wrappedOnboardingFile.relativePath,
		rule: "touch-target",
	});
}

function runKeyboardOnlyHintRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedOnboardingFile = getAuditFile(
		auditFiles,
		WRAPPED_ONBOARDING_SHELL_PATH,
	);

	addLineFindings({
		auditFile: wrappedOnboardingFile,
		findings,
		message:
			"The wrapped copy assumes keyboard navigation. For a phone-first story route, the hint should mention tap or swipe first, with keyboard as a secondary affordance.",
		pattern: /Use arrow keys/g,
		rule: "mobile-affordance",
	});
}

function runOverflowRule(
	auditFiles: readonly AuditFile[],
	findings: Finding[],
) {
	const wrappedCssFile = getAuditFile(auditFiles, WRAPPED_CSS_PATH);

	addLineFindings({
		auditFile: wrappedCssFile,
		findings,
		message:
			"`overflow: hidden` on the wrapped body or route can block large-text fallback scrolling. For Apple-style mobile resilience, allow the page or individual slides to scroll when content outgrows the viewport.",
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
