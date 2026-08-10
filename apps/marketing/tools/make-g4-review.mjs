import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(
	process.env.OPALINE_G4_ROOT ?? ".context/gates/g4-blind-final-20260810-rerun",
);
const report = JSON.parse(
	await readFile(path.join(root, "report.json"), "utf8"),
);
const files = (await readdir(path.join(root, "candidate")))
	.filter((file) => file.endsWith(".png"))
	.sort();

const escapeHtml = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const hash = (value) => {
	let result = 2166136261;
	for (const character of value) {
		result ^= character.charCodeAt(0);
		result = Math.imul(result, 16777619);
	}
	return result >>> 0;
};

const metricByFile = new Map(
	report.results.map((result) => [result.candidate, result.pixel.diffPercent]),
);

const shell = (title, description, cards, columns) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: #f2f2f2; color: #191919; }
header { position: sticky; z-index: 10; top: 0; padding: 20px 24px; border-bottom: 1px solid #d8d8d8; background: rgba(255,255,255,.94); backdrop-filter: blur(18px); }
h1 { margin: 0 0 6px; font-size: 20px; }
p { margin: 0; color: #666; font-size: 14px; }
main { display: grid; gap: 18px; padding: 18px; }
article { overflow: hidden; border: 1px solid #d6d6d6; border-radius: 14px; background: white; box-shadow: 0 3px 14px rgba(0,0,0,.04); }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 13px; border-bottom: 1px solid #e7e7e7; font-size: 13px; }
.metric { color: #6b6b6b; font-variant-numeric: tabular-nums; }
.shots { display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 1px; background: #dedede; }
.shot { min-width: 0; background: white; }
.label { padding: 7px 10px; border-bottom: 1px solid #ececec; color: #666; font-size: 12px; font-weight: 600; }
img { display: block; width: 100%; height: auto; background: white; }
details { margin-top: 10px; font-size: 13px; }
summary { cursor: pointer; }
@media (max-width: 800px) { .shots { grid-template-columns: 1fr; } header { position: static; } }
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>
<main>${cards}</main>
</body>
</html>`;

const sideBySideCards = files
	.map((file) => {
		const metric = metricByFile.get(file);
		return `<article>
<div class="meta"><strong>${escapeHtml(file.replace(/\.png$/, ""))}</strong><span class="metric">${metric?.toFixed(6) ?? "—"}% diff</span></div>
<div class="shots">
<div class="shot"><div class="label">Reference · 4180</div><img loading="lazy" src="./reference/${escapeHtml(file)}" alt="Reference ${escapeHtml(file)}"></div>
<div class="shot"><div class="label">Candidate · 4321</div><img loading="lazy" src="./candidate/${escapeHtml(file)}" alt="Candidate ${escapeHtml(file)}"></div>
<div class="shot"><div class="label">Pixel diff</div><img loading="lazy" src="./diff/${escapeHtml(file)}" alt="Difference ${escapeHtml(file)}"></div>
</div>
</article>`;
	})
	.join("\n");

const blindCards = files
	.map((file) => {
		const candidateFirst = hash(file) % 2 === 0;
		const first = candidateFirst ? "candidate" : "reference";
		const second = candidateFirst ? "reference" : "candidate";
		return `<article>
<div class="meta"><strong>${escapeHtml(file.replace(/\.png$/, ""))}</strong><span class="metric">Fresh pair</span></div>
<div class="shots">
<div class="shot"><div class="label">A</div><img loading="lazy" src="./${first}/${escapeHtml(file)}" alt="Option A for ${escapeHtml(file)}"></div>
<div class="shot"><div class="label">B</div><img loading="lazy" src="./${second}/${escapeHtml(file)}" alt="Option B for ${escapeHtml(file)}"></div>
</div>
<div class="meta"><details><summary>Reveal key</summary>A is ${first === "candidate" ? "4321 candidate" : "4180 reference"}; B is ${second === "candidate" ? "4321 candidate" : "4180 reference"}.</details></div>
</article>`;
	})
	.join("\n");

await writeFile(
	path.join(root, "side-by-side.html"),
	shell(
		"Opaline G4 · labeled side-by-side",
		`Fresh captures only · ${report.shotCounts.compared} states · generated ${report.generatedAt}`,
		sideBySideCards,
		3,
	),
);
await writeFile(
	path.join(root, "blind-review.html"),
	shell(
		"Opaline G4 · blind review",
		`A/B order is deterministically shuffled per state · ${report.shotCounts.compared} fresh pairs · reveal each key only after judging`,
		blindCards,
		2,
	),
);

console.log(
	JSON.stringify(
		{
			root,
			pairs: files.length,
			outputs: ["side-by-side.html", "blind-review.html"],
		},
		null,
		2,
	),
);
