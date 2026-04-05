import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const configPath = path.join(appRoot, "shadcn-preset.json");

const registryComponents = [
	"avatar",
	"badge",
	"calendar",
	"card",
	"checkbox",
	"dialog",
	"dropdown-menu",
	"field",
	"input",
	"label",
	"popover",
	"select",
	"separator",
	"sheet",
	"skeleton",
	"table",
	"tabs",
	"toggle",
	"toggle-group",
	"tooltip",
];

const managedPackages = {
	dependencies: [
		"@fontsource-variable/inter",
		"@hugeicons/core-free-icons",
		"@hugeicons/react",
		"class-variance-authority",
		"clsx",
		"tailwind-merge",
		"tw-animate-css",
	],
	devDependencies: ["shadcn"],
};

function runCommand(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		env: {
			...process.env,
			PKG_HARDEN_BYPASS: "1",
		},
		stdio: "inherit",
	});

	if (result.status !== 0) {
		throw new Error(
			`Command failed: ${command} ${args.join(" ")} (exit ${result.status ?? "unknown"})`,
		);
	}
}

function normalizeContent(content) {
	return content
		.replaceAll("@/components/ui/", "@/app/ui/")
		.replaceAll("@/components/ui", "@/app/ui");
}

async function copyFileWithNormalization(sourcePath, destinationPath) {
	const rawContent = await fs.readFile(sourcePath, "utf8");
	await fs.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.writeFile(destinationPath, normalizeContent(rawContent), "utf8");
}

async function syncComponentsJson(sourcePath, destinationPath) {
	const config = JSON.parse(await fs.readFile(sourcePath, "utf8"));
	config.aliases = {
		...config.aliases,
		ui: "@/app/ui",
	};
	config.rsc = false;

	await fs.writeFile(
		destinationPath,
		`${JSON.stringify(config, null, "\t")}\n`,
		"utf8",
	);
}

async function syncIndexCss(sourcePath, destinationPath) {
	let content = await fs.readFile(sourcePath, "utf8");
	content = content.replace(
		'@import "@fontsource-variable/inter";\n',
		'@import "@fontsource-variable/inter";\n@import "./app/preset-extensions.css";\n',
	);
	await fs.writeFile(destinationPath, content, "utf8");
}

async function mergeManagedPackages(scaffoldPackagePath, appPackagePath) {
	const scaffoldPackage = JSON.parse(
		await fs.readFile(scaffoldPackagePath, "utf8"),
	);
	const appPackage = JSON.parse(await fs.readFile(appPackagePath, "utf8"));
	let didChange = false;

	for (const packageName of managedPackages.dependencies) {
		const nextVersion =
			scaffoldPackage.dependencies?.[packageName] ??
			scaffoldPackage.devDependencies?.[packageName];
		if (!nextVersion) continue;

		const currentVersion =
			appPackage.dependencies?.[packageName] ??
			appPackage.devDependencies?.[packageName];

		if (currentVersion === nextVersion) continue;

		appPackage.dependencies ??= {};
		appPackage.dependencies[packageName] = nextVersion;
		didChange = true;
	}

	for (const packageName of managedPackages.devDependencies) {
		const nextVersion =
			scaffoldPackage.devDependencies?.[packageName] ??
			scaffoldPackage.dependencies?.[packageName];
		if (!nextVersion) continue;

		const currentVersion =
			appPackage.devDependencies?.[packageName] ??
			appPackage.dependencies?.[packageName];

		if (currentVersion === nextVersion) continue;

		appPackage.devDependencies ??= {};
		appPackage.devDependencies[packageName] = nextVersion;
		didChange = true;
	}

	if (didChange) {
		await fs.writeFile(
			appPackagePath,
			`${JSON.stringify(appPackage, null, "\t")}\n`,
			"utf8",
		);
	}

	return didChange;
}

async function main() {
	const presetConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
	const scratchContainer = path.join(
		repoRoot,
		".context",
		`preset-vite-${presetConfig.presetCode}`,
	);
	const scaffoldRoot = path.join(scratchContainer, "__preset_sync__");

	await fs.rm(scratchContainer, { recursive: true, force: true });
	await fs.mkdir(scratchContainer, { recursive: true });

	runCommand(
		"bunx",
		[
			"--bun",
			"shadcn@latest",
			"init",
			"--preset",
			presetConfig.presetCode,
			"--template",
			presetConfig.template,
			"--base",
			presetConfig.base,
			"--name",
			"__preset_sync__",
			"--yes",
		],
		scratchContainer,
	);

	runCommand(
		"bunx",
		[
			"--bun",
			"shadcn@latest",
			"add",
			...registryComponents,
			"--overwrite",
			"--yes",
		],
		scaffoldRoot,
	);

	const appPackagePath = path.join(appRoot, "package.json");
	const scaffoldPackagePath = path.join(scaffoldRoot, "package.json");
	const packageDidChange = await mergeManagedPackages(
		scaffoldPackagePath,
		appPackagePath,
	);

	const syncedFiles = [];
	const skippedFiles = [];

	for (const managedFile of presetConfig.managedFiles) {
		if (managedFile === "components.json") {
			await syncComponentsJson(
				path.join(scaffoldRoot, "components.json"),
				path.join(appRoot, "components.json"),
			);
			syncedFiles.push(managedFile);
			continue;
		}

		if (managedFile === "src/index.css") {
			await syncIndexCss(
				path.join(scaffoldRoot, "src", "index.css"),
				path.join(appRoot, "src", "index.css"),
			);
			syncedFiles.push(managedFile);
			continue;
		}

		if (managedFile === "src/app/luma.css") {
			const sourcePath = path.join(scaffoldRoot, "src", "app", "luma.css");
			try {
				await fs.access(sourcePath);
				await copyFileWithNormalization(sourcePath, path.join(appRoot, managedFile));
				syncedFiles.push(managedFile);
			} catch {
				skippedFiles.push(`${managedFile} (not generated by preset)`);
			}
			continue;
		}

		const fileName = path.basename(managedFile);
		const sourcePath = path.join(scaffoldRoot, "src", "components", "ui", fileName);
		const destinationPath = path.join(appRoot, managedFile);

		try {
			await fs.access(sourcePath);
			await copyFileWithNormalization(sourcePath, destinationPath);
			syncedFiles.push(managedFile);
		} catch {
			skippedFiles.push(`${managedFile} (missing in scaffold)`);
		}
	}

	if (packageDidChange) {
		runCommand("bun", ["install"], repoRoot);
	}

	console.log("\nPreset sync complete.");
	console.log(`Preset: ${presetConfig.presetCode}`);
	console.log("\nManaged files updated:");
	for (const file of syncedFiles) {
		console.log(`- ${file}`);
	}

	if (skippedFiles.length > 0) {
		console.log("\nManaged files skipped:");
		for (const file of skippedFiles) {
			console.log(`- ${file}`);
		}
	}

	console.log("\nPreserved custom islands:");
	for (const file of presetConfig.preservedFiles) {
		console.log(`- ${file}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
