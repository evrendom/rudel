// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const restrictedImportPatterns = [
	{
		group: ["**/.context/**"],
		message:
			"Do not import from .context. Scratch and generator artifacts must never become runtime source.",
	},
];

export default defineConfig(
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/coverage/**",
			"**/.turbo/**",
			"**/.context/**",
			"**/generated/**",
			"**/*.d.ts",
		],
	},
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		rules: {
			curly: ["error", "all"],
			"no-cond-assign": ["error", "always"],
			"no-else-return": "error",
			"no-implicit-coercion": ["error", { allow: ["!!"] }],
			"no-multi-assign": "error",
			"no-restricted-imports": [
				"error",
				{
					patterns: restrictedImportPatterns,
				},
			],
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"ImportSpecifier[imported.name='useEffect'][parent.source.value='react']",
					message:
						"Do not import useEffect directly. Derive state during render, move interaction logic into event handlers, use a query abstraction, or isolate mount-only sync in a dedicated hook.",
				},
				{
					selector:
						"ImportSpecifier[imported.name='useLayoutEffect'][parent.source.value='react']",
					message:
						"Do not import useLayoutEffect directly. If imperative DOM sync is truly required, isolate it in a dedicated hook and document why.",
				},
				{
					selector:
						"CallExpression[callee.object.name='React'][callee.property.name='useEffect']",
					message:
						"Do not use React.useEffect directly. Derive state during render, move interaction logic into event handlers, use a query abstraction, or isolate mount-only sync in a dedicated hook.",
				},
				{
					selector:
						"CallExpression[callee.object.name='React'][callee.property.name='useLayoutEffect']",
					message:
						"Do not use React.useLayoutEffect directly. If imperative DOM sync is truly required, isolate it in a dedicated hook and document why.",
				},
			],
			"no-return-assign": ["error", "always"],
			"no-sequences": "error",
			"no-unneeded-ternary": "error",
			"no-unreachable": "error",
			"no-undef": "off",
			"object-shorthand": ["error", "always"],
			"prefer-const": "error",
			"prefer-template": "error",
		},
	},
	{
		files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
		ignores: [
			"**/__tests__/**",
			"**/*.test.*",
			"**/*.spec.*",
			"**/*.integration.*",
			"**/*.e2e.*",
			"packages/api-routes/src/schemas/**",
			"packages/ch-schema/src/db/schema/**",
			"apps/web/src/features/dashboard/data/**",
		],
		rules: {
			eqeqeq: ["error", "always"],
			complexity: ["error", 10],
			"max-depth": ["error", 3],
			"max-lines": [
				"error",
				{
					max: 500,
					skipBlankLines: true,
					skipComments: true,
				},
			],
			"max-lines-per-function": [
				"error",
				{
					max: 60,
					skipBlankLines: true,
					skipComments: true,
				},
			],
			"max-params": ["error", 3],
			"no-nested-ternary": "error",
			"no-param-reassign": ["error", { props: true }],
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		rules: {
			"@typescript-eslint/ban-ts-comment": [
				"error",
				{
					"ts-ignore": true,
					"ts-nocheck": true,
					"ts-expect-error": "allow-with-description",
					minimumDescriptionLength: 8,
				},
			],
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	{
		files: [
			"apps/web/src/app/hooks/useMountEffect.ts",
			"apps/web/src/hooks/useTrackDashboardView.ts",
			"apps/web/src/features/shell/hooks/useSidebarDisplayMode.ts",
			"apps/web/src/features/shell/hooks/useSidebarNewsActiveAttribute.ts",
		],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
);
