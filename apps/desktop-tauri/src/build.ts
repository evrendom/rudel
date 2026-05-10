import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distDir = join(appRoot, "dist");
const assetsDir = join(distDir, "assets");
const entryPoint = fileURLToPath(new URL("./main.tsx", import.meta.url));
const staticIndex = join(appRoot, "static", "index.html");

export async function buildDesktopFrontend(): Promise<boolean> {
	await rm(distDir, { recursive: true, force: true });
	await mkdir(assetsDir, { recursive: true });

	const build = await Bun.build({
		entrypoints: [entryPoint],
		outdir: assetsDir,
		target: "browser",
		naming: "main.[ext]",
	});

	if (!build.success) {
		for (const log of build.logs) {
			console.error(log);
		}
		return false;
	}

	await copyFile(staticIndex, join(distDir, "index.html"));
	return true;
}

if (import.meta.main) {
	const success = await buildDesktopFrontend();
	if (!success) {
		process.exitCode = 1;
	}
}
