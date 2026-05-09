import type { SkillBlueprint, SkillModule } from "@rudel/skill-schema";

export const typescriptStandardsBlueprint: SkillBlueprint = {
	id: "typescript-standards",
	slug: "typescript-standards",
	name: "TypeScript Standards",
	description:
		"TypeScript coding standards for writing, reviewing, and refactoring code.",
	trigger:
		"Use when writing TypeScript, reviewing TypeScript code, or refactoring TypeScript modules.",
	version: "1.0.0",
	modules: [
		{ moduleId: "named-exports", required: true },
		{ moduleId: "package-exports", required: true },
		{ moduleId: "import-patterns", required: true },
		{ moduleId: "type-only-imports", required: true },
		{ moduleId: "zod-derived-types", required: true },
		{ moduleId: "unsafe-type-assertions", required: true },
		{ moduleId: "discriminated-unions", required: true },
		{ moduleId: "optional-properties", required: true },
		{ moduleId: "no-enums", required: true },
		{ moduleId: "async-operations", required: true },
		{ moduleId: "immutability", required: true },
	],
	targets: ["claude_code", "codex", "cursor"],
	blocks: [],
	variables: [],
};

export const typescriptStandardsModules: SkillModule[] = [
	standardsModule(
		"named-exports",
		"Named Exports",
		"Use named exports. Do not add default exports for functions, components, services, or utilities.",
	),
	standardsModule(
		"package-exports",
		"Package Exports",
		"Export only what consumers need. Keep package public interfaces explicit and avoid broad export-star barrels for internal modules.",
	),
	standardsModule(
		"import-patterns",
		"Import Patterns",
		"Prefer static imports. Dynamic imports are allowed only for intentional lazy loading, feature flags, environment-specific code, or circular dependency breaks.",
	),
	standardsModule(
		"type-only-imports",
		"Type-Only Imports",
		"Use explicit type-only imports for values used only as TypeScript types.",
	),
	standardsModule(
		"zod-derived-types",
		"Zod-Derived Types",
		"When a Zod schema exists, derive TypeScript types from it with z.infer or a package-exported inferred type. Do not duplicate schema shapes in separate interfaces.",
	),
	standardsModule(
		"unsafe-type-assertions",
		"Avoid Unsafe Type Assertions",
		"Do not use unsafe assertions like `as SomeType` or `as unknown as SomeType`. `as const`, `satisfies`, type guards, and z.infer-derived types are allowed.",
	),
	standardsModule(
		"discriminated-unions",
		"Discriminated Unions",
		"Prefer discriminated unions for state machines and branchable result types so impossible states cannot be represented.",
	),
	standardsModule(
		"optional-properties",
		"Optional Properties",
		"Use optional properties sparingly. Prefer explicit `T | undefined` when callers should make absence visible.",
	),
	standardsModule(
		"no-enums",
		"No Enums",
		"Use `as const` objects and derived union types instead of TypeScript enums.",
	),
	standardsModule(
		"async-operations",
		"Async Operations",
		"Use Promise.all for independent async work that can run in parallel.",
	),
	standardsModule(
		"immutability",
		"Immutability",
		"Prefer readonly arrays, const assertions, and new objects over mutation when modeling shared state.",
	),
];

function standardsModule(id: string, title: string, body: string): SkillModule {
	return {
		id,
		slug: id,
		name: title,
		kind: "agent_instruction",
		blocks: [
			{
				id: `${id}-rule`,
				kind: "agent_instruction",
				title,
				body,
			},
		],
	};
}
