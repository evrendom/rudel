import { createHash } from "node:crypto";
import type {
	ArtifactTarget,
	GeneratedArtifact,
	RepoOverlay,
	SkillBlock,
	SkillBlueprint,
	SkillModule,
} from "@rudel/skill-schema";

export const SKILL_SCHEMA_VERSION = "1";
export const SKILL_COMPILER_VERSION = "1";

export type CompileBlueprintInput = {
	blueprint: SkillBlueprint;
	blueprintVersionId?: string;
	modules?: SkillModule[];
	overlay?: RepoOverlay;
	overlayHash?: string;
	targets?: ArtifactTarget[];
};

export function compileSkillBlueprint(
	input: CompileBlueprintInput,
): GeneratedArtifact[] {
	const targets =
		input.targets && input.targets.length > 0
			? input.targets
			: input.blueprint.targets;
	const overlayHash =
		input.overlayHash ?? hashStableJson(input.overlay ?? null);
	const blueprintVersionId =
		input.blueprintVersionId ?? input.blueprint.version;

	return targets.map((artifactTarget) => {
		const content = renderSkillArtifact(input, artifactTarget);
		return {
			artifactTarget,
			targetPath: getTargetPath(input.blueprint.slug, artifactTarget),
			content,
			contentHash: hashContent(content),
			blueprintId: input.blueprint.id,
			blueprintVersionId,
			overlayHash,
			schemaVersion: SKILL_SCHEMA_VERSION,
			compilerVersion: SKILL_COMPILER_VERSION,
		};
	});
}

export function getTargetPath(
	slug: string,
	artifactTarget: ArtifactTarget,
): string {
	switch (artifactTarget) {
		case "claude_code":
			return `.claude/skills/${slug}/SKILL.md`;
		case "codex":
			return `.agents/skills/${slug}/SKILL.md`;
		case "cursor":
			return `.cursor/rules/${slug}.mdc`;
		case "agents_md":
			return "AGENTS.md";
		case "claude_md":
			return "CLAUDE.md";
	}
}

export function hashContent(content: string): string {
	return createHash("sha256").update(normalizeContent(content)).digest("hex");
}

export function hashStableJson(value: unknown): string {
	return hashContent(stableStringify(value));
}

function renderSkillArtifact(
	input: CompileBlueprintInput,
	artifactTarget: ArtifactTarget,
): string {
	if (artifactTarget === "cursor") {
		return renderCursorRule(input);
	}
	if (artifactTarget === "agents_md" || artifactTarget === "claude_md") {
		return renderManagedSection(input, artifactTarget);
	}
	return renderSkillMarkdown(input, artifactTarget);
}

function renderSkillMarkdown(
	input: CompileBlueprintInput,
	artifactTarget: ArtifactTarget,
): string {
	const variables = buildVariables(input);
	const moduleBlocks = selectModules(input).flatMap((module) => module.blocks);
	const blocks = [
		...input.blueprint.blocks,
		...moduleBlocks,
		...(input.overlay?.appendedBlocks ?? []),
	];

	const sections = blocks.map((block) => renderBlock(block, variables));
	const frontmatter = frontmatterForTarget(input.blueprint, artifactTarget);

	const content = [
		`# ${input.blueprint.name}`,
		"",
		replaceVariables(input.blueprint.description, variables),
		"",
		"## Trigger",
		"",
		replaceVariables(input.blueprint.trigger, variables),
		"",
		...sections,
	]
		.join("\n")
		.trimEnd()
		.concat("\n");

	return frontmatter ? `${frontmatter}${content}` : content;
}

function renderCursorRule(input: CompileBlueprintInput): string {
	const body = renderSkillMarkdown(input, "cursor");
	return [
		"---",
		`description: ${input.blueprint.description}`,
		"globs: **/*.ts,**/*.tsx",
		"alwaysApply: false",
		"---",
		"",
		body,
	]
		.join("\n")
		.trimEnd()
		.concat("\n");
}

function renderManagedSection(
	input: CompileBlueprintInput,
	artifactTarget: "agents_md" | "claude_md",
): string {
	const body = renderSkillMarkdown(input, artifactTarget)
		.trimEnd()
		.replace(/^# /, "## ");

	return [
		`<!-- rudel:${input.blueprint.slug}:start -->`,
		body,
		`<!-- rudel:${input.blueprint.slug}:end -->`,
		"",
	].join("\n");
}

function frontmatterForTarget(
	blueprint: SkillBlueprint,
	artifactTarget: ArtifactTarget,
): string {
	if (artifactTarget !== "claude_code" && artifactTarget !== "codex") {
		return "";
	}

	return [
		"---",
		`name: ${blueprint.slug}`,
		`description: ${blueprint.description}`,
		"allowed-tools: [Read, Edit, Grep, Glob]",
		"---",
		"",
	].join("\n");
}

function selectModules(input: CompileBlueprintInput): SkillModule[] {
	const enabled = new Set(input.overlay?.enabledModules ?? []);
	const disabled = new Set(input.overlay?.disabledModules ?? []);
	const requested = new Set(
		input.blueprint.modules
			.filter(
				(moduleRef) => moduleRef.required || enabled.has(moduleRef.moduleId),
			)
			.map((moduleRef) => moduleRef.moduleId),
	);

	return (input.modules ?? []).filter(
		(module) => requested.has(module.id) && !disabled.has(module.id),
	);
}

function buildVariables(input: CompileBlueprintInput): Record<string, string> {
	const base = Object.fromEntries(
		input.blueprint.variables.map((variable) => [
			variable.name,
			variable.defaultValue ?? "",
		]),
	);

	return {
		...base,
		...(input.overlay?.variables ?? {}),
	};
}

function renderBlock(
	block: SkillBlock,
	variables: Record<string, string>,
): string {
	return [
		`## ${block.title}`,
		"",
		replaceVariables(block.body, variables),
		"",
	].join("\n");
}

function replaceVariables(
	value: string,
	variables: Record<string, string>,
): string {
	return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, name) => {
		return variables[name] ?? "";
	});
}

function normalizeContent(content: string): string {
	return content.replace(/\r\n/g, "\n");
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	return `{${Object.entries(value)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
		.join(",")}}`;
}

export {
	typescriptStandardsBlueprint,
	typescriptStandardsModules,
} from "./typescript-standards.js";
