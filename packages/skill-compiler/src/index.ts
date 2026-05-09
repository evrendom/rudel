import { createHash } from "node:crypto";
import type {
	AgentTarget,
	GeneratedArtifact,
	RepoOverlay,
	SkillBlock,
	SkillBlueprint,
	SkillModule,
} from "@rudel/skill-schema";

export type CompileBlueprintInput = {
	blueprint: SkillBlueprint;
	modules?: SkillModule[];
	overlay?: RepoOverlay;
	targets?: AgentTarget[];
};

export function compileSkillBlueprint(
	input: CompileBlueprintInput,
): GeneratedArtifact[] {
	const targets =
		input.targets && input.targets.length > 0
			? input.targets
			: input.blueprint.targets;

	return targets.map((agentTarget) => {
		const content = renderSkillMarkdown(input, agentTarget);
		return {
			agentTarget,
			targetPath: getTargetPath(input.blueprint.slug, agentTarget),
			content,
			contentHash: hashContent(content),
		};
	});
}

export function getTargetPath(slug: string, agentTarget: AgentTarget): string {
	switch (agentTarget) {
		case "claude_code":
			return `.claude/skills/${slug}/SKILL.md`;
		case "codex":
			return `.agents/skills/${slug}/SKILL.md`;
		case "cursor":
			return `.cursor/skills/${slug}/SKILL.md`;
		case "agents_md":
			return "AGENTS.md";
	}
}

export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function renderSkillMarkdown(
	input: CompileBlueprintInput,
	agentTarget: AgentTarget,
): string {
	const variables = buildVariables(input);
	const moduleBlocks = selectModules(input).flatMap((module) => module.blocks);
	const blocks = [
		...input.blueprint.blocks,
		...moduleBlocks,
		...(input.overlay?.appendedBlocks ?? []),
	];

	const sections = blocks.map((block) => renderBlock(block, variables));
	const header =
		agentTarget === "agents_md"
			? `## ${input.blueprint.name}`
			: `# ${input.blueprint.name}`;

	return [
		header,
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
