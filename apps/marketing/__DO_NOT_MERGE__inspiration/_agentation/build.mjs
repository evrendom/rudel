import { createRequire } from "node:module";

const requireFromWeb = createRequire(
	new URL("../../../web/package.json", import.meta.url),
);
const packagePaths = new Map(
	[
		"agentation",
		"react",
		"react-dom/client",
		"react/jsx-runtime",
		"react/jsx-dev-runtime",
	].map(
		(specifier) => [specifier, requireFromWeb.resolve(specifier)],
	),
);

const result = await Bun.build({
	entrypoints: [new URL("overlay.tsx", import.meta.url).pathname],
	outdir: new URL(".", import.meta.url).pathname,
	naming: "overlay.js",
	target: "browser",
	format: "esm",
	minify: true,
	sourcemap: "none",
	plugins: [
		{
			name: "resolve-agentation-runtime",
			setup(build) {
				build.onResolve(
					{
						filter:
							/^(?:agentation|react|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/,
					},
					({ path }) => ({ path: packagePaths.get(path) }),
				);
			},
		},
	],
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exitCode = 1;
}
