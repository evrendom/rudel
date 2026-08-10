import { existsSync, statSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	injectAgentation,
} from "../_agentation/server.mjs";

const rootUrl = new URL(".", import.meta.url);
const port = Number.parseInt(
	process.env.OPALINE_VERCEL_REFERENCE_PORT || "4181",
	10,
);
const defaultFile = "vercel-home.capture.html";
const capturePath = fileURLToPath(new URL(defaultFile, rootUrl));
const temporaryCapturePath = fileURLToPath(
	new URL(`${defaultFile}.tmp`, rootUrl),
);
const maximumCaptureBytes = 24 * 1024 * 1024;
const vercelOrigin = "https://vercel.com";
const vercelOriginGuardChunkPath =
	"/vc-ap-vercel-marketing/_next/static/immutable/chunks/02-py99tso6fg.js";
const vercelOriginGuardSource = "c();try{if(function(e,t=[]){";
const localOriginGuard =
	'c();try{if(["127.0.0.1","localhost"].includes(window.location.hostname))return;if(function(e,t=[]){';
const fieldMethodAssetFlag = "opaline-field-method";
const triangleHeightSource = "180/630*.8";
const trianglelessHeightSource = "1/630*.8";
const fieldMethodWorkerEntryPaths = new Set([
	"/vc-ap-vercel-marketing/_next/static/immutable/chunks/0lxba-uaas6p5.js",
	"/vc-ap-vercel-marketing/_next/static/immutable/chunks/1o6wrm1mc4udq.js",
]);
const fieldMethodDefault = "offscreen";
const fieldMethods = new Map([
	[
		"edge-off",
		{
			label: "Edge off",
			note: "Keep the native glow, suppress its sharp rim",
			shortLabel: "01",
		},
	],
	[
		"offscreen",
		{
			label: "Offscreen",
			note: "Move the source beyond the visible frame",
			shortLabel: "02",
		},
	],
	[
		"point",
		{
			label: "Point",
			note: "Collapse all three edges into one origin",
			shortLabel: "03",
		},
	],
	[
		"scatter",
		{
			label: "Scatter",
			note: "Distribute colored emitters organically",
			shortLabel: "04",
		},
	],
	[
		"blobs",
		{
			label: "Soft blobs",
			note: "Replace edges with three broad color clouds",
			shortLabel: "05",
		},
	],
	[
		"noise",
		{
			label: "Full noise",
			note: "Generate color everywhere with no source shape",
			shortLabel: "06",
		},
	],
	[
		"repair",
		{
			label: "Blur repair",
			note: "Blur only the source after it is rendered",
			shortLabel: "07",
		},
	],
]);
const nativeFieldMethods = new Set([
	"edge-off",
	"offscreen",
	"point",
	"repair",
]);

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const localReferenceStyles = `<style data-vercel-header-reference>
	html,
	body {
		min-height: 100%;
		background: var(--ds-background-200, #fafafa);
	}

	body {
		margin: 0;
		overflow-x: hidden;
	}

	main [data-cdp-scope*='"name":"hero"'] > :last-child,
	main [data-cdp-scope*='"name":"hero"'] ~ *,
	main [data-cdp-scope*='"name":"platform"'],
	main [data-cdp-scope*='"name":"latest"'],
	main [data-cdp-scope*='"name":"get_started"'],
	div:has(> footer[data-cdp-scope*='"name":"footer"']),
	footer,
	nav[aria-label="Vercel Directory"],
	.fides-banner,
	.fides-overlay,
	#fides-overlay,
	#fides-modal-link {
		display: none !important;
	}

	main [data-cdp-scope*='"name":"hero"'] {
		min-height: calc(100svh - var(--header-height, 64px)) !important;
	}
</style>`;

const colorFieldStyles = `<style data-vercel-color-field-reference>
	html,
	body {
		width: 100%;
		height: 100%;
		margin: 0;
		overflow: hidden;
		background: var(--ds-background-200, #fafafa);
	}

	body > .flex.min-w-0,
	body > .flex.min-w-0 > :first-child,
	main,
	main > div:has(> [data-cdp-scope*='"name":"hero"']),
	main [data-cdp-scope*='"name":"hero"'],
	main [data-cdp-scope*='"name":"hero"'] > :first-child,
	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active] {
		width: 100% !important;
		height: 100% !important;
		min-width: 0 !important;
		min-height: 0 !important;
		max-width: none !important;
		max-height: none !important;
		margin: 0 !important;
		padding: 0 !important;
	}

	#marketing-header,
	#marketing-header + div,
	#geist-skip-nav,
	body > .flex.min-w-0 > aside,
	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active] > :not(:first-child),
	[class*="styles-module__toolbarContainer"] {
		display: none !important;
	}

	main {
		position: fixed !important;
		inset: 0 !important;
		overflow: hidden !important;
	}

	main > div:has(> [data-cdp-scope*='"name":"hero"']),
	main [data-cdp-scope*='"name":"hero"'],
	main [data-cdp-scope*='"name":"hero"'] > :first-child,
	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active],
	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active] > :first-child {
		position: absolute !important;
		inset: 0 !important;
	}

	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active] > :first-child {
		width: 100% !important;
		height: 100% !important;
		min-width: 0 !important;
		min-height: 0 !important;
	}

	main [data-cdp-scope*='"name":"hero"'] [data-hero-drop-active] > :first-child > :first-child {
		position: absolute !important;
		top: 50% !important;
		left: 50% !important;
		inset-inline-end: auto !important;
		inset-block-end: auto !important;
		width: max(100vw, 150svh) !important;
		height: max(100svh, 66.6667vw) !important;
		max-width: none !important;
		max-height: none !important;
		aspect-ratio: 3 / 2 !important;
		transform: none !important;
		translate: -50% -50% !important;
	}

	html[data-color-field-canvas="off"] canvas[data-triangle-led-4-hero-canvas="true"] {
		opacity: 0 !important;
		transition: none !important;
	}

	html[data-color-field-dom-triangle="off"] main [data-cdp-scope*='"name":"hero"'] div:has(> svg > polygon[fill="#000"]),
	html[data-color-field-fallback="off"] main [data-cdp-scope*='"name":"hero"'] [data-hero-static-fallback="triangle-led-4"],
	html[data-color-field-advanced="off"] .lil-gui {
		display: none !important;
	}

	html[data-color-field-dom-triangle="on"] main [data-cdp-scope*='"name":"hero"'] div:has(> [data-hero-static-fallback="triangle-led-4"]),
	html[data-color-field-fallback="on"] main [data-cdp-scope*='"name":"hero"'] div:has(> [data-hero-static-fallback="triangle-led-4"]) {
		opacity: 1 !important;
		transition: none !important;
	}

	html[data-color-field-dom-triangle="on"] main [data-cdp-scope*='"name":"hero"'] div:has(> svg > polygon[fill="#000"]) {
		display: block !important;
	}

	canvas[data-triangle-led-4-hero-canvas="true"] {
		width: 100% !important;
		height: 100% !important;
		transition: none !important;
	}

	html[data-field-method="edge-off"] canvas[data-triangle-led-4-hero-canvas="true"] {
		filter: blur(16px) saturate(1.05);
		transform: scale(1.055);
	}

	html[data-field-method="offscreen"] canvas[data-triangle-led-4-hero-canvas="true"] {
		filter: saturate(1.06);
		transform: scale(1.55) translateX(48%);
		transform-origin: 50% 50%;
	}

	html[data-field-method="point"] canvas[data-triangle-led-4-hero-canvas="true"] {
		filter: blur(8px) saturate(1.08);
		transform: scale(1.025);
	}

	html[data-field-method="repair"] [data-field-repair-mask] {
		display: block;
	}

	html[data-field-method] canvas[data-triangle-led-4-hero-canvas="true"] {
		opacity: 0 !important;
	}

	html[data-color-field-iteration="circle"] canvas[data-triangle-led-4-hero-canvas="true"] {
		opacity: 0 !important;
	}

	[data-field-experiment-canvas] {
		position: fixed;
		inset: 0;
		z-index: 2;
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	[data-field-circle-overlay] {
		position: fixed;
		z-index: 3;
		border-radius: 50%;
		background: #fff;
		pointer-events: none;
	}

	[data-field-scale-control],
	[data-field-scale-control] * {
		box-sizing: border-box;
	}

	[data-field-scale-control] {
		position: fixed;
		bottom: max(16px, env(safe-area-inset-bottom));
		left: 50%;
		z-index: 2147483647;
		display: grid;
		width: min(378px, calc(100% - 24px));
		padding: 5px 7px;
		translate: -50% 0;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.13);
		color: #111;
		font: 11px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		backdrop-filter: blur(20px) saturate(1.2);
		-webkit-backdrop-filter: blur(20px) saturate(1.2);
	}

	[data-field-scale-row] {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) 52px;
		gap: 10px;
		min-height: 48px;
		align-items: center;
		padding-left: 6px;
	}

	[data-field-scale-row] + [data-field-scale-row] {
		border-top: 1px solid rgba(0, 0, 0, 0.08);
	}

	[data-field-scale-label] {
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	[data-field-scale-input],
	[data-field-center-scale-input] {
		width: 100%;
		height: 44px;
		margin: 0;
		accent-color: #111;
		cursor: ew-resize;
	}

	[data-field-scale-reset],
	[data-field-center-scale-reset] {
		min-width: 52px;
		height: 44px;
		padding: 0 7px;
		border: 0;
		border-radius: 9px;
		background: rgba(0, 0, 0, 0.065);
		color: inherit;
		font: inherit;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	[data-field-scale-reset]:hover,
	[data-field-center-scale-reset]:hover {
		background: rgba(0, 0, 0, 0.1);
	}

	[data-field-scale-reset]:focus-visible,
	[data-field-center-scale-reset]:focus-visible,
	[data-field-scale-input]:focus-visible,
	[data-field-center-scale-input]:focus-visible {
		outline: 2px solid #0070f3;
		outline-offset: 2px;
	}

	[data-field-layer-control],
	[data-field-layer-control] * {
		box-sizing: border-box;
	}

	[data-field-layer-control] {
		position: fixed;
		top: 50%;
		right: 12px;
		z-index: 2147483647;
		width: 168px;
		overflow: hidden;
		translate: 0 -50%;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.13);
		color: #111;
		font: 11px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		backdrop-filter: blur(20px) saturate(1.2);
		-webkit-backdrop-filter: blur(20px) saturate(1.2);
	}

	[data-field-layer-header] {
		display: grid;
		gap: 2px;
		padding: 12px 13px 10px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}

	[data-field-layer-kicker] {
		color: rgba(0, 0, 0, 0.48);
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	[data-field-layer-title] {
		font-size: 12px;
		font-weight: 680;
		letter-spacing: -0.02em;
	}

	[data-field-layer-list] {
		display: grid;
		padding: 5px;
	}

	[data-field-layer-option] {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 22px;
		gap: 5px;
		min-height: 44px;
		align-items: center;
		padding: 0 7px;
		border-radius: 9px;
		cursor: pointer;
	}

	[data-field-layer-option]:hover {
		background: rgba(0, 0, 0, 0.045);
	}

	[data-field-layer-toggle] {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: #111;
	}

	[data-field-layer-name] {
		font-weight: 620;
		letter-spacing: -0.01em;
	}

	[data-field-layer-state] {
		color: rgba(0, 0, 0, 0.42);
		font-size: 9px;
		text-align: right;
		text-transform: uppercase;
	}

	[data-field-layer-toggle]:focus-visible {
		outline: 2px solid #0070f3;
		outline-offset: 3px;
	}

	html[data-layer-white="off"] [data-field-circle-overlay] {
		display: none;
	}

	@media (max-width: 440px) {
		[data-field-scale-control] {
			bottom: max(12px, env(safe-area-inset-bottom));
			width: calc(100% - 24px);
		}

		[data-field-layer-control] {
			top: 12px;
			right: 8px;
			width: 148px;
			translate: 0;
		}
	}

	[data-field-repair-mask] {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 3;
		display: none;
		width: min(36vw, 460px);
		aspect-ratio: 1.16;
		translate: -50% -48%;
		border-radius: 50%;
		background: transparent;
		backdrop-filter: blur(34px) saturate(1.06);
		-webkit-backdrop-filter: blur(34px) saturate(1.06);
		-webkit-mask-image: radial-gradient(circle, #000 25%, rgba(0, 0, 0, 0.7) 52%, transparent 86%);
		mask-image: radial-gradient(circle, #000 25%, rgba(0, 0, 0, 0.7) 52%, transparent 86%);
		pointer-events: none;
	}

	[data-field-method-rail],
	[data-field-method-rail] * {
		box-sizing: border-box;
	}

	[data-field-method-rail] {
		position: fixed;
		top: 50%;
		right: 12px;
		z-index: 2147483647;
		width: 184px;
		overflow: hidden;
		translate: 0 -50%;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.14);
		color: #111;
		font: 11px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		backdrop-filter: blur(20px) saturate(1.2);
		-webkit-backdrop-filter: blur(20px) saturate(1.2);
	}

	[data-field-method-rail-header] {
		display: grid;
		gap: 2px;
		padding: 13px 13px 11px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}

	[data-field-method-rail-kicker] {
		color: rgba(0, 0, 0, 0.48);
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	[data-field-method-rail-title] {
		font-size: 12px;
		font-weight: 680;
		letter-spacing: -0.02em;
	}

	[data-field-method-nav] {
		display: grid;
		padding: 5px;
	}

	[data-field-method-option] {
		position: relative;
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		gap: 7px;
		min-height: 48px;
		align-items: center;
		padding: 7px 8px;
		border-radius: 9px;
		color: inherit;
		text-decoration: none;
	}

	[data-field-method-option]::before {
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 0;
		width: 2px;
		border-radius: 999px;
		background: transparent;
		content: "";
	}

	[data-field-method-option]:hover {
		background: rgba(0, 0, 0, 0.045);
	}

	[data-field-method-option][aria-current="page"] {
		background: rgba(0, 0, 0, 0.07);
	}

	[data-field-method-option][aria-current="page"]::before {
		background: #111;
	}

	[data-field-method-index] {
		color: rgba(0, 0, 0, 0.42);
		font-size: 9px;
		font-variant-numeric: tabular-nums;
	}

	[data-field-method-copy] {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	[data-field-method-name] {
		font-size: 11px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	[data-field-method-note] {
		color: rgba(0, 0, 0, 0.48);
		font-size: 8px;
		line-height: 1.3;
	}

	[data-field-method-family] {
		padding: 9px 13px 11px;
		border-top: 1px solid rgba(0, 0, 0, 0.08);
		color: rgba(0, 0, 0, 0.48);
		font-size: 8px;
		line-height: 1.35;
	}

	[data-field-method-family] strong {
		color: rgba(0, 0, 0, 0.72);
		font-weight: 650;
	}

	@media (max-width: 620px) {
		[data-field-method-rail] {
			right: 8px;
			width: 148px;
		}

		[data-field-method-rail-header] {
			padding: 10px;
		}

		[data-field-method-option] {
			grid-template-columns: 20px minmax(0, 1fr);
			gap: 5px;
			min-height: 44px;
			padding: 5px 6px;
		}

		[data-field-method-note] {
			display: none;
		}

		[data-field-method-family] {
			padding: 8px 10px 9px;
		}

		[data-field-repair-mask] {
			width: min(72vw, 420px);
		}
	}

	[data-color-field-inspector],
	[data-color-field-inspector] * {
		box-sizing: border-box;
	}

	[data-color-field-inspector] {
		position: fixed;
		top: 12px;
		left: 12px;
		z-index: 2147483647;
		width: min(248px, calc(100vw - 24px));
		overflow: hidden;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.88);
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
		color: #111;
		font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		backdrop-filter: blur(18px) saturate(1.2);
		-webkit-backdrop-filter: blur(18px) saturate(1.2);
	}

	[data-color-field-inspector-header] {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 40px;
		padding: 8px 10px 8px 12px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}

	[data-color-field-inspector-title] {
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	[data-color-field-collapse] {
		display: grid;
		width: 28px;
		height: 28px;
		padding: 0;
		place-items: center;
		border: 0;
		border-radius: 7px;
		background: rgba(0, 0, 0, 0.055);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	[data-color-field-inspector-body] {
		display: grid;
		gap: 8px;
		padding: 10px 12px 12px;
	}

	[data-color-field-inspector][data-collapsed="true"] {
		width: auto;
	}

	[data-color-field-inspector][data-collapsed="true"] [data-color-field-inspector-body] {
		display: none;
	}

	[data-color-field-inspector][data-collapsed="true"] [data-color-field-inspector-header] {
		gap: 12px;
		border-bottom: 0;
	}

	[data-color-field-layer] {
		display: flex;
		min-height: 28px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		cursor: pointer;
	}

	[data-color-field-layer] input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: #111;
	}

	[data-color-field-note] {
		margin: 2px 0 0;
		color: rgba(0, 0, 0, 0.52);
		font-size: 10px;
	}

	[data-color-field-presets] {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		padding-top: 3px;
	}

	[data-color-field-preset] {
		min-height: 30px;
		padding: 5px;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.72);
		color: inherit;
		font: inherit;
		font-size: 10px;
		cursor: pointer;
	}

	[data-color-field-collapse]:hover,
	[data-color-field-preset]:hover {
		background: rgba(0, 0, 0, 0.08);
	}
</style>`;

const localReferenceBootstrap = `<script data-vercel-header-reference-bootstrap>
	try {
		localStorage.setItem("zeit-theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
	} catch {}
</script>`;

const colorFieldLightThemeBootstrap = `<script data-vercel-color-field-theme-bootstrap>
	try {
		localStorage.setItem("zeit-theme", "light");
	} catch {}
	document.documentElement.classList.remove("dark-theme");
	document.documentElement.classList.add("light-theme");
	document.documentElement.style.colorScheme = "light";
</script>`;

const colorFieldInspectorMarkup = `<div data-color-field-inspector-header>
	<strong data-color-field-inspector-title>Layer inspector</strong>
	<button data-color-field-collapse type="button" aria-label="Collapse layer inspector">−</button>
</div>
<div data-color-field-inspector-body>
	<label data-color-field-layer><span>Scene canvas</span><input data-color-field-toggle="canvas" type="checkbox"></label>
	<label data-color-field-layer><span>Shader occluder</span><input data-color-field-toggle="occluder" type="checkbox"></label>
	<label data-color-field-layer><span>DOM triangle</span><input data-color-field-toggle="domTriangle" type="checkbox"></label>
	<label data-color-field-layer><span>Static glow / noise</span><input data-color-field-toggle="fallback" type="checkbox"></label>
	<label data-color-field-layer><span>Advanced shader GUI</span><input data-color-field-toggle="advanced" type="checkbox"></label>
	<p data-color-field-note>Click the field to animate it. Advanced exposes Vercel's native shader controls.</p>
	<div data-color-field-presets>
		<button data-color-field-preset="canvas" type="button">Canvas only</button>
		<button data-color-field-preset="all" type="button">All visible</button>
		<button data-color-field-preset="reset" type="button">Reset</button>
	</div>
</div>`;

const createFieldMethodRailMarkup = (activeMethod) => {
	const activeFamily = nativeFieldMethods.has(activeMethod)
		? "Source-preserving treatment"
		: "Geometry-free rebuild";
	const options = [...fieldMethods.entries()]
		.map(
			([method, details]) => `<a
			data-field-method-option="${method}"
			href="/color-field/triangleless?method=${method}"
			${method === activeMethod ? 'aria-current="page"' : ""}
		>
			<span data-field-method-index>${details.shortLabel}</span>
			<span data-field-method-copy>
				<strong data-field-method-name>${details.label}</strong>
				<span data-field-method-note>${details.note}</span>
			</span>
		</a>`,
		)
		.join("");

	return `<div data-field-method-rail-header>
		<span data-field-method-rail-kicker>Triangle removal</span>
		<strong data-field-method-rail-title>Color-field lab</strong>
	</div>
	<nav data-field-method-nav aria-label="Removal method">
		${options}
	</nav>
	<div data-field-method-family><strong>${activeFamily}</strong><br>Click the field to shift its energy.</div>`;
};

const createColorFieldInspectorBootstrap = (displayPath) =>
	`<script data-vercel-color-field-inspector-bootstrap>(() => {
		const root = document.documentElement;
		const defaults = {
			advanced: false,
			canvas: true,
			domTriangle: false,
			fallback: false,
			occluder: true,
		};
		const state = { ...defaults };
		const attributes = {
			advanced: "data-color-field-advanced",
			canvas: "data-color-field-canvas",
			domTriangle: "data-color-field-dom-triangle",
			fallback: "data-color-field-fallback",
		};
		const displayPath = ${JSON.stringify(displayPath)};
		let occluderInput;

		const findOccluderInput = () => {
			const controller = [...document.querySelectorAll(".lil-controller.lil-boolean")].find(
				(element) => element.querySelector(".lil-name")?.textContent?.trim() === "Show occluder triangle",
			);
			return controller?.querySelector('input[type="checkbox"]');
		};

		const syncOccluder = () => {
			const input = findOccluderInput();
			if (!input) return false;
			if (occluderInput !== input) {
				occluderInput = input;
				input.addEventListener("change", () => setLayer("occluder", input.checked, false));
			}
			if (input.checked !== state.occluder) input.click();
			history.replaceState(null, "", displayPath);
			return true;
		};

		const setLayer = (key, enabled, syncNative = true) => {
			state[key] = enabled;
			const attribute = attributes[key];
			if (attribute) root.setAttribute(attribute, enabled ? "on" : "off");
			const checkbox = document.querySelector('[data-color-field-toggle="' + key + '"]');
			if (checkbox) checkbox.checked = enabled;
			if (key === "occluder" && syncNative) syncOccluder();
		};

		for (const [key, enabled] of Object.entries(defaults)) setLayer(key, enabled, false);

		const applyPreset = (name) => {
			const preset =
				name === "canvas"
					? { advanced: false, canvas: true, domTriangle: false, fallback: false, occluder: false }
					: name === "all"
						? { advanced: false, canvas: true, domTriangle: true, fallback: true, occluder: true }
						: defaults;
			for (const [key, enabled] of Object.entries(preset)) setLayer(key, enabled);
		};

		const mount = () => {
			const panel = document.createElement("aside");
			panel.setAttribute("data-color-field-inspector", "");
			panel.setAttribute("data-collapsed", "false");
			panel.setAttribute("aria-label", "Color field layer inspector");
			panel.innerHTML = ${JSON.stringify(colorFieldInspectorMarkup)};
			panel.addEventListener("pointerup", (event) => event.stopPropagation());
			document.body.append(panel);

			for (const input of panel.querySelectorAll("[data-color-field-toggle]")) {
				const key = input.getAttribute("data-color-field-toggle");
				input.checked = state[key];
				input.addEventListener("change", () => setLayer(key, input.checked));
			}

			panel.querySelector("[data-color-field-collapse]")?.addEventListener("click", (event) => {
				const collapsed = panel.getAttribute("data-collapsed") === "true";
				panel.setAttribute("data-collapsed", collapsed ? "false" : "true");
				event.currentTarget.textContent = collapsed ? "−" : "+";
				event.currentTarget.setAttribute(
					"aria-label",
					collapsed ? "Collapse layer inspector" : "Expand layer inspector",
				);
			});

			for (const button of panel.querySelectorAll("[data-color-field-preset]")) {
				button.addEventListener("click", () =>
					applyPreset(button.getAttribute("data-color-field-preset")),
				);
			}

			if (!syncOccluder()) {
				const observer = new MutationObserver(() => {
					if (syncOccluder()) observer.disconnect();
				});
				observer.observe(document.body, { childList: true, subtree: true });
				setTimeout(() => observer.disconnect(), 12000);
			}
		};

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", mount, { once: true });
		} else {
			mount();
		}
	})()</script>`;

const createTrianglelessBootstrap = (fieldMethod) => {
	const railMarkup = createFieldMethodRailMarkup(fieldMethod);
	const methodSettings = {};

	return `<script data-vercel-triangleless-bootstrap>(() => {
		const root = document.documentElement;
		const method = ${JSON.stringify(fieldMethod)};
		const methodSettings = ${JSON.stringify(methodSettings)};
		const proceduralModes = new Map([
			["edge-off", 0],
			["offscreen", 1],
			["point", 2],
			["scatter", 3],
			["blobs", 4],
			["noise", 5],
			["repair", 6],
		]);
		root.setAttribute("data-color-field-advanced", "off");
		root.setAttribute("data-color-field-canvas", "on");
		root.setAttribute("data-color-field-dom-triangle", "off");
		root.setAttribute("data-color-field-fallback", "off");
		root.setAttribute("data-field-method", method);

		const nativeWorker = window.Worker;
		const workers = [];
		let toggleProceduralEnergy;
		window.__opalineTrianglelessWorkers = workers;

		const mergeMethodSettings = (settings = {}) => ({
			...settings,
			hero: { ...settings.hero, ...methodSettings.hero },
			lightAo: { ...settings.lightAo, ...methodSettings.lightAo },
			lightGlow: { ...settings.lightGlow, ...methodSettings.lightGlow },
			occluderTriangle: {
				...settings.occluderTriangle,
				showOccluderTriangle: false,
			},
		});

		window.Worker = class TrianglelessWorker extends nativeWorker {
			constructor(url, options) {
				let workerUrl = String(url);
				const hashIndex = workerUrl.indexOf("#");
				if (hashIndex >= 0 && workerUrl.includes("turbopack-worker-")) {
					const base = workerUrl.slice(0, hashIndex);
					const separator = base.includes("?") ? "&" : "?";
					workerUrl =
						base +
						separator +
						${JSON.stringify(`${fieldMethodAssetFlag}=`)} +
						encodeURIComponent(method) +
						workerUrl.slice(hashIndex);
				}
				super(workerUrl, options);
				workers.push(this);
			}

			postMessage(message, transfer) {
				let nextMessage = message;
				if (message?.type === "init") {
					nextMessage = {
						...message,
						settings: mergeMethodSettings(message.settings),
					};
				} else if (message?.type === "settings") {
					nextMessage = {
						...message,
						patch: mergeMethodSettings(message.patch),
					};
				}
				if (arguments.length > 1) return super.postMessage(nextMessage, transfer);
				return super.postMessage(nextMessage);
			}
		};

		const startProceduralField = (canvas, mode) => {
			const context = canvas.getContext("2d", { alpha: false });
			if (!context) return false;

			const palette = [[255, 48, 88], [45, 224, 105], [34, 111, 255]];
			const random = (seed) => {
				const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
				return value - Math.floor(value);
			};
			const counts = [3, 3, 3, 14, 3, 24, 3];
			const count = counts[mode] || 3;
			const sources = Array.from({ length: count }, (_, index) => {
				if ([0, 1, 2, 4, 6].includes(mode)) {
					const configurations = {
						0: {
							x: [0.39, 0.5, 0.61],
							y: [0.44, 0.61, 0.44],
							radius: [0.37, 0.4, 0.37],
						},
						1: {
							x: [1.02, 1.13, 1.04],
							y: [0.2, 0.51, 0.82],
							radius: [0.66, 0.72, 0.68],
						},
						2: {
							x: [0.472, 0.5, 0.528],
							y: [0.49, 0.535, 0.49],
							radius: [0.31, 0.33, 0.31],
						},
						4: {
							x: [0.27, 0.51, 0.74],
							y: [0.37, 0.68, 0.36],
							radius: [0.46, 0.48, 0.45],
						},
						6: {
							x: [0.4, 0.5, 0.6],
							y: [0.46, 0.61, 0.46],
							radius: [0.32, 0.35, 0.32],
						},
					};
					const configuration = configurations[mode];
					return {
						x: configuration.x[index],
						y: configuration.y[index],
						radius: configuration.radius[index],
						phase: index * 2.1,
						speed: 0.07 + index * 0.015,
						color: palette[index],
					};
				}
				return {
					x: 0.04 + random(index * 5.31 + 1) * 0.92,
					y: 0.04 + random(index * 8.17 + 2) * 0.92,
					radius: mode === 3
						? 0.12 + random(index * 3.47 + 3) * 0.12
						: 0.22 + random(index * 4.11 + 4) * 0.18,
					phase: random(index * 9.71 + 5) * Math.PI * 2,
					speed: 0.035 + random(index * 2.93 + 6) * 0.07,
					color: palette[index % palette.length],
				};
			});
			const grainCanvas = document.createElement("canvas");
			grainCanvas.width = 96;
			grainCanvas.height = 96;
			const grainContext = grainCanvas.getContext("2d");
			const grain = grainContext?.createImageData(96, 96);
			if (grain && grainContext) {
				for (let offset = 0; offset < grain.data.length; offset += 4) {
					const value = Math.floor(random(offset + 17) * 255);
					grain.data[offset] = value;
					grain.data[offset + 1] = value;
					grain.data[offset + 2] = value;
					grain.data[offset + 3] = 32;
				}
				grainContext.putImageData(grain, 0, 0);
			}

			let energy = 1;
			let targetEnergy = 1;
			let animationFrame;
			let lastFrameAt = 0;
			const startedAt = performance.now();
			const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
			toggleProceduralEnergy = () => {
				targetEnergy = targetEnergy > 0.75 ? 0.42 : 1;
			};

			const resize = () => {
				const ratio = Math.min(devicePixelRatio || 1, 0.58);
				const width = Math.max(1, Math.round(innerWidth * ratio));
				const height = Math.max(1, Math.round(innerHeight * ratio));
				if (canvas.width !== width || canvas.height !== height) {
					canvas.width = width;
					canvas.height = height;
				}
			};

			const render = (now) => {
				if (now - lastFrameAt < 1000 / 20) {
					animationFrame = requestAnimationFrame(render);
					return;
				}
				lastFrameAt = now;
				resize();
				energy += (targetEnergy - energy) * 0.06;
				const time = reducedMotion.matches ? 0 : (now - startedAt) / 1000;
				const longestEdge = Math.max(canvas.width, canvas.height);
				context.fillStyle = "#fdfbf8";
				context.fillRect(0, 0, canvas.width, canvas.height);

				for (const [index, source] of sources.entries()) {
					const movement = mode === 4 ? 0.035 : mode === 3 ? 0.028 : mode === 5 ? 0.05 : 0.012;
					const x = (source.x + Math.sin(time * source.speed + source.phase) * movement) * canvas.width;
					const y = (source.y + Math.cos(time * source.speed * 0.83 + source.phase) * movement) * canvas.height;
					const radius = source.radius * longestEdge;
					const alpha = (mode === 5 ? 0.18 : mode === 4 ? 0.34 : mode === 3 ? 0.28 : 0.38) * energy;
					const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
					gradient.addColorStop(0, "rgba(" + source.color.join(",") + "," + alpha + ")");
					gradient.addColorStop(0.36, "rgba(" + source.color.join(",") + "," + alpha * 0.68 + ")");
					gradient.addColorStop(1, "rgba(" + source.color.join(",") + ",0)");
					context.fillStyle = gradient;
					context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
					if (mode === 3 && index % 4 === 0) {
						context.fillStyle = "rgba(255,255,255," + 0.08 * energy + ")";
						context.fillRect(x - radius * 0.08, y - radius * 0.08, radius * 0.16, radius * 0.16);
					}
				}

				if (mode === 6) {
					const top = [canvas.width * 0.5, canvas.height * 0.34];
					const left = [canvas.width * 0.39, canvas.height * 0.58];
					const right = [canvas.width * 0.61, canvas.height * 0.58];
					const edges = [[top, left], [left, right], [right, top]];
					context.save();
					context.filter = "blur(4px)";
					context.lineWidth = Math.max(3, canvas.height * 0.008);
					for (const [index, edge] of edges.entries()) {
						context.beginPath();
						context.moveTo(edge[0][0], edge[0][1]);
						context.lineTo(edge[1][0], edge[1][1]);
						context.strokeStyle = "rgba(" + palette[index].join(",") + ",0.5)";
						context.stroke();
					}
					context.restore();
				}

				const pattern = context.createPattern(grainCanvas, "repeat");
				if (pattern) {
					context.save();
					context.globalAlpha = mode === 5 ? 0.13 : 0.055;
					context.translate((time * 7) % 96, (time * 4) % 96);
					context.fillStyle = pattern;
					context.fillRect(-96, -96, canvas.width + 192, canvas.height + 192);
					context.restore();
				}
				animationFrame = requestAnimationFrame(render);
			};

			addEventListener("resize", resize, { passive: true });
			resize();
			animationFrame = requestAnimationFrame(render);
			addEventListener("pagehide", () => cancelAnimationFrame(animationFrame), { once: true });
			return true;
		};

		const mountLab = () => {
			const repairMask = document.createElement("div");
			repairMask.setAttribute("data-field-repair-mask", "");
			repairMask.setAttribute("aria-hidden", "true");
			document.body.append(repairMask);

			const rail = document.createElement("aside");
			rail.setAttribute("data-field-method-rail", "");
			rail.setAttribute("aria-label", "Triangle removal comparison");
			rail.innerHTML = ${JSON.stringify(railMarkup)};
			rail.addEventListener("pointerup", (event) => event.stopPropagation());
			document.body.append(rail);

			const proceduralMode = proceduralModes.get(method);
			if (proceduralMode !== undefined) {
				const canvas = document.createElement("canvas");
				canvas.setAttribute("data-field-experiment-canvas", method);
				canvas.setAttribute("aria-hidden", "true");
				document.body.append(canvas);
				if (!startProceduralField(canvas, proceduralMode)) {
					canvas.remove();
					root.setAttribute("data-field-procedural-error", "true");
				} else {
					const retireNativeField = () => {
						for (const worker of workers.splice(0)) worker.terminate();
					};
					setTimeout(retireNativeField, 250);
					setTimeout(retireNativeField, 1000);
					setTimeout(retireNativeField, 3000);
				}
			}
		};

		document.addEventListener(
			"pointerup",
			(event) => {
				if (event.button !== 0 || !event.isPrimary) return;
				if (
					event.target instanceof Element &&
					event.target.closest(
						'a,button,input,select,textarea,label,[role="button"],[contenteditable="true"]',
					)
				) {
					return;
				}
				event.stopImmediatePropagation();
				if (toggleProceduralEnergy) {
					toggleProceduralEnergy();
					return;
				}
				for (const worker of workers) {
					worker.postMessage({ type: "click", click: { kind: "toggle" } });
				}
			},
			true,
		);

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", mountLab, { once: true });
		} else {
			mountLab();
		}
	})()</script>`;
};

const createCircleFieldBootstrap = (dotMode = "") =>
	`<script data-vercel-circle-field-bootstrap>(() => {
		const root = document.documentElement;
		const dotMode = ${JSON.stringify(dotMode)};
		root.setAttribute("data-color-field-advanced", "off");
		root.setAttribute("data-color-field-canvas", "on");
		root.setAttribute("data-color-field-dom-triangle", "off");
		root.setAttribute("data-color-field-fallback", "off");
		root.setAttribute("data-color-field-iteration", "circle");
		if (dotMode) root.setAttribute("data-dot-field-mode", dotMode);

		const nativeWorker = window.Worker;
		const workers = [];
		let toggleFallbackEnergy;
		let usingNativeWarp = false;
		let fieldScale = dotMode ? 0.49 : 1;
		let centerScale = dotMode ? 0.01 : 1;
		const layerVisibility = {
			outer: 1,
			refraction: 1,
			inner: 1,
			white: 1,
		};
		let syncWhiteCircleOverlay = () => {};
		root.setAttribute("data-field-scale", fieldScale.toFixed(2));
		root.setAttribute("data-center-scale", centerScale.toFixed(2));
		for (const layer of Object.keys(layerVisibility)) {
			root.setAttribute("data-layer-" + layer, "on");
		}
		window.__opalineCircleFieldWorkers = workers;
		window.Worker = class CircleFieldWorker extends nativeWorker {
			constructor(url, options) {
				super(url, options);
				workers.push(this);
			}

			postMessage(message, transfer) {
				let nextMessage = message;
				if (message?.type === "init") {
					nextMessage = {
						...message,
						settings: {
							...message.settings,
							occluderTriangle: {
								...message.settings?.occluderTriangle,
								showOccluderTriangle: false,
							},
						},
					};
				} else if (message?.type === "settings") {
					nextMessage = {
						...message,
						patch: {
							...message.patch,
							occluderTriangle: {
								...message.patch?.occluderTriangle,
								showOccluderTriangle: false,
							},
						},
					};
				}
				if (arguments.length > 1) return super.postMessage(nextMessage, transfer);
				return super.postMessage(nextMessage);
			}
		};

		const startProceduralCone = (canvas) => {
			const context = canvas.getContext("2d", { alpha: false });
			if (!context) return false;

			const palette = [[255, 45, 76], [35, 115, 255], [35, 220, 104]];
			const arcs = [
				{ start: Math.PI * 5 / 6, color: palette[0] },
				{ start: -Math.PI / 2, color: palette[1] },
				{ start: Math.PI / 6, color: palette[2] },
			];
			const random = (seed) => {
				const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
				return value - Math.floor(value);
			};
			const grainCanvas = document.createElement("canvas");
			grainCanvas.width = 96;
			grainCanvas.height = 96;
			const grainContext = grainCanvas.getContext("2d");
			const grain = grainContext?.createImageData(96, 96);
			if (grain && grainContext) {
				for (let offset = 0; offset < grain.data.length; offset += 4) {
					const value = Math.floor(random(offset + 29) * 255);
					grain.data[offset] = value;
					grain.data[offset + 1] = value;
					grain.data[offset + 2] = value;
					grain.data[offset + 3] = 28;
				}
				grainContext.putImageData(grain, 0, 0);
			}

			let energy = 1;
			let targetEnergy = 1;
			let animationFrame;
			let lastFrameAt = 0;
			const startedAt = performance.now();
			const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
			toggleFallbackEnergy = () => {
				targetEnergy = targetEnergy > 0.78 ? 0.48 : 1;
			};

			const resize = () => {
				const ratio = Math.min(devicePixelRatio || 1, 0.72);
				const width = Math.max(1, Math.round(innerWidth * ratio));
				const height = Math.max(1, Math.round(innerHeight * ratio));
				if (canvas.width !== width || canvas.height !== height) {
					canvas.width = width;
					canvas.height = height;
				}
			};

			const rgba = (color, alpha) =>
				"rgba(" + color.join(",") + "," + alpha + ")";

			const drawConeFace = (centerX, centerY, radius, arc, intensity) => {
				const end = arc.start + Math.PI * 2 / 3;
				const midpoint = arc.start + Math.PI / 3;
				const rimX = centerX + Math.cos(midpoint) * radius;
				const rimY = centerY + Math.sin(midpoint) * radius;
				const gradient = context.createLinearGradient(
					centerX,
					centerY,
					rimX,
					rimY,
				);
				gradient.addColorStop(0, "rgba(255,255,255,0.58)");
				gradient.addColorStop(0.12, rgba(arc.color, 0.08 * intensity));
				gradient.addColorStop(0.58, rgba(arc.color, 0.19 * intensity));
				gradient.addColorStop(1, rgba(arc.color, 0.34 * intensity));

				context.beginPath();
				context.moveTo(centerX, centerY);
				context.lineTo(
					centerX + Math.cos(arc.start) * radius,
					centerY + Math.sin(arc.start) * radius,
				);
				context.arc(centerX, centerY, radius, arc.start, end);
				context.closePath();
				context.fillStyle = gradient;
				context.fill();
			};

			const drawArc = (centerX, centerY, radius, arc, intensity) => {
				const start = arc.start - 0.018;
				const end = arc.start + Math.PI * 2 / 3 + 0.018;
				context.save();
				context.beginPath();
				context.arc(centerX, centerY, radius, start, end);
				context.filter = "blur(" + Math.max(5, radius * 0.06) + "px)";
				context.lineWidth = Math.max(8, radius * 0.14);
				context.strokeStyle = rgba(arc.color, 0.2 * intensity);
				context.stroke();
				context.restore();

				context.save();
				context.beginPath();
				context.arc(centerX, centerY, radius, start, end);
				context.lineWidth = Math.max(2, radius * 0.034);
				context.shadowColor = rgba(arc.color, 0.9);
				context.shadowBlur = Math.max(8, radius * 0.065) * intensity;
				context.strokeStyle = rgba(arc.color, 0.8);
				context.stroke();
				context.restore();

				context.save();
				context.beginPath();
				context.arc(centerX, centerY, radius, start, end);
				context.lineWidth = Math.max(0.8, radius * 0.006);
				context.strokeStyle = "rgba(255,255,255," + 0.7 * intensity + ")";
				context.stroke();
				context.restore();
			};

			const render = (now) => {
				if (now - lastFrameAt < 1000 / 24) {
					animationFrame = requestAnimationFrame(render);
					return;
				}
				lastFrameAt = now;
				resize();
				energy += (targetEnergy - energy) * 0.055;
				const time = reducedMotion.matches ? 0 : (now - startedAt) / 1000;
				const width = canvas.width;
				const height = canvas.height;
				const longestEdge = Math.max(width, height);
				const centerX = width * 0.5;
				const centerY = height * 0.5;
				const baseRadius = Math.min(width, height) * 0.225;
				const outerRadius = baseRadius * fieldScale;
				const innerRadius = baseRadius * centerScale;
				const pulse = 0.96 + Math.sin(time * 0.42) * 0.04;

				context.fillStyle = "#fdfbf8";
				context.fillRect(0, 0, width, height);

				if (layerVisibility.outer) {
					for (const arc of arcs) {
						const midpoint = arc.start + Math.PI / 3;
						const drift = Math.sin(time * 0.16 + midpoint) * outerRadius * 0.018;
						const sourceX = centerX + Math.cos(midpoint) * (outerRadius * 0.88 + drift);
						const sourceY = centerY + Math.sin(midpoint) * (outerRadius * 0.88 + drift);
						const glowRadius = longestEdge * (0.58 + energy * 0.08) * fieldScale;
						const gradient = context.createRadialGradient(
							sourceX,
							sourceY,
							0,
							sourceX,
							sourceY,
							glowRadius,
						);
						gradient.addColorStop(0, rgba(arc.color, 0.4 * energy));
						gradient.addColorStop(0.24, rgba(arc.color, 0.27 * energy));
						gradient.addColorStop(0.68, rgba(arc.color, 0.09 * energy));
						gradient.addColorStop(1, rgba(arc.color, 0));
						context.fillStyle = gradient;
						context.fillRect(0, 0, width, height);
					}
				}

				if (layerVisibility.inner) {
					context.save();
					context.beginPath();
					context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
					context.clip();
					context.fillStyle = "rgba(255,255,255,0.12)";
					context.fillRect(centerX - innerRadius, centerY - innerRadius, innerRadius * 2, innerRadius * 2);
					for (const arc of arcs) drawConeFace(centerX, centerY, innerRadius, arc, energy);
					const centerLight = context.createRadialGradient(
						centerX,
						centerY,
						0,
						centerX,
						centerY,
						innerRadius * 0.42,
					);
					centerLight.addColorStop(0, "rgba(255,255,255,0.9)");
					centerLight.addColorStop(0.08, "rgba(255,255,255,0.58)");
					centerLight.addColorStop(0.38, "rgba(255,255,255,0.16)");
					centerLight.addColorStop(1, "rgba(255,255,255,0)");
					context.fillStyle = centerLight;
					context.fillRect(centerX - innerRadius, centerY - innerRadius, innerRadius * 2, innerRadius * 2);
					context.restore();
				}

				if (layerVisibility.refraction) {
					for (const arc of arcs) drawArc(centerX, centerY, innerRadius, arc, energy * pulse);

					context.save();
					for (let index = 0; index < 66; index += 1) {
						const angle = index / 66 * Math.PI * 2;
						const arcIndex = angle >= Math.PI * 5 / 6 && angle < Math.PI * 3 / 2
							? 0
							: angle < Math.PI / 6 || angle >= Math.PI * 3 / 2
								? 1
								: 2;
						const offset = (random(index * 4.17 + Math.floor(time * 3)) - 0.5) * innerRadius * 0.075;
						const particleRadius = innerRadius + offset;
						const x = centerX + Math.cos(angle) * particleRadius;
						const y = centerY + Math.sin(angle) * particleRadius;
						const size = 0.35 + random(index * 7.31) * 1.15;
						context.fillStyle = rgba(palette[arcIndex], (0.14 + random(index * 2.77) * 0.33) * energy);
						context.fillRect(x, y, size, size);
					}
					context.restore();
				}

				const pattern = context.createPattern(grainCanvas, "repeat");
				if (pattern && layerVisibility.outer) {
					context.save();
					context.globalAlpha = 0.06;
					context.translate((time * 6) % 96, (time * 3) % 96);
					context.fillStyle = pattern;
					context.fillRect(-96, -96, width + 192, height + 192);
					context.restore();
				}
				animationFrame = requestAnimationFrame(render);
			};

			addEventListener("resize", resize, { passive: true });
			resize();
			animationFrame = requestAnimationFrame(render);
			addEventListener("pagehide", () => cancelAnimationFrame(animationFrame), { once: true });

			return true;
		};

		const startNativeConeWarp = (canvas, sourceCanvas) => {
			const gl = canvas.getContext("webgl2", {
				alpha: false,
				antialias: false,
				preserveDrawingBuffer: false,
			});
			if (!gl) return false;

			const vertexSource = [
				"#version 300 es",
				"precision highp float;",
				"out vec2 v_uv;",
				"void main() {",
				"  vec2 positions[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));",
				"  vec2 position = positions[gl_VertexID];",
				"  v_uv = position * 0.5 + 0.5;",
				"  gl_Position = vec4(position, 0.0, 1.0);",
				"}",
			].join("\\n");
			const fragmentSource = [
				"#version 300 es",
				"precision highp float;",
				"uniform sampler2D u_frame;",
				"uniform vec2 u_viewport_css;",
				"uniform vec2 u_source_css;",
				"uniform float u_scale;",
				"uniform float u_center_scale;",
				"uniform float u_show_outer;",
				"uniform float u_show_refraction;",
				"uniform float u_show_inner;",
				"uniform float u_show_white;",
				"uniform int u_dot_mode;",
				"uniform float u_time;",
				"uniform vec2 u_pointer;",
				"uniform vec2 u_secondary;",
				"in vec2 v_uv;",
				"out vec4 out_color;",
				"vec3 resolve_field(vec4 field) {",
				"  return mix(vec3(0.9803922), field.rgb, field.a);",
				"}",
				"float smooth_field(float minimum, float maximum, float value) {",
				"  float normalized = clamp((value - minimum) / (maximum - minimum), 0.0, 1.0);",
				"  return normalized * normalized * (3.0 - 2.0 * normalized);",
				"}",
				"vec3 sample_circle_field(vec2 field_position) {",
				"  vec2 position = field_position / max(u_scale, 0.001);",
				"  float radius = length(position);",
				"  vec2 direction = radius > 0.0001 ? position / radius : vec2(0.0, 1.0);",
				"  vec2 normal_bottom = vec2(0.0, -1.0);",
				"  vec2 normal_upper_right = vec2(0.8660254, 0.5);",
				"  vec2 normal_upper_left = vec2(-0.8660254, 0.5);",
				"  float facing = max(dot(normal_bottom, direction), max(dot(normal_upper_right, direction), dot(normal_upper_left, direction)));",
				"  float triangle_inradius = u_source_css.y * 0.059;",
				"  float triangle_boundary = triangle_inradius / max(facing, 0.001);",
				"  float circle_radius = triangle_inradius * 1.7320508;",
				"  float normalized_radius = radius / circle_radius;",
				"  float center_ratio = clamp(u_center_scale / max(u_scale, 0.001), 0.001, 1.0);",
				"  float outer_anchor = 6.0;",
				"  float inner_sample_radius = normalized_radius / center_ratio;",
				"  float outer_sample_radius = 1.0 + (normalized_radius - center_ratio) * (outer_anchor - 1.0) / (outer_anchor - center_ratio);",
				"  float stretched_radius = normalized_radius <= center_ratio ? inner_sample_radius : outer_sample_radius;",
				"  vec2 stretched_position = direction * stretched_radius * circle_radius;",
				"  vec2 stretched_warped = direction * stretched_radius * triangle_boundary;",
				"  float restore_original = smoothstep(3.2, outer_anchor, stretched_radius);",
				"  vec2 sample_position = mix(stretched_warped, stretched_position, restore_original);",
				"  vec2 source_uv = clamp(vec2(0.5) + sample_position / u_source_css, vec2(0.0), vec2(1.0));",
				"  vec3 stretched_color = resolve_field(texture(u_frame, source_uv));",
				"  vec3 floor_color = vec3(0.9803922);",
				"  float outer_mask = smoothstep(1.45, 1.55, stretched_radius) * u_show_outer;",
				"  vec3 color = mix(floor_color, stretched_color, outer_mask);",
				"  float refraction_mask = smoothstep(0.86, 0.94, stretched_radius) * (1.0 - smoothstep(1.55, 1.65, stretched_radius)) * u_show_refraction;",
				"  color = mix(color, stretched_color, refraction_mask);",
				"  float inner_mask = (1.0 - smoothstep(0.94, 1.02, stretched_radius)) * u_show_inner;",
				"  color = mix(color, stretched_color, inner_mask);",
				"  float white_mask = (1.0 - smoothstep(center_ratio * 0.94, center_ratio * 1.02, normalized_radius)) * u_show_white;",
				"  return mix(color, vec3(1.0), white_mask);",
				"}",
				"void main() {",
				"  vec2 viewport_position = (v_uv - 0.5) * u_viewport_css;",
				"  if (u_dot_mode == 0) {",
				"    out_color = vec4(sample_circle_field(viewport_position), 1.0);",
				"    return;",
				"  }",
				"  float grid_spacing = 13.55;",
				"  vec2 cell = floor(viewport_position / grid_spacing + 0.5);",
				"  vec2 dot_center = cell * grid_spacing;",
				"  vec2 local_position = viewport_position - dot_center;",
				"  vec2 primary_scale = vec2(u_viewport_css.x * 0.31, u_viewport_css.y * 0.29);",
				"  vec2 secondary_scale = vec2(u_viewport_css.x * 0.34, u_viewport_css.y * 0.34);",
				"  float primary_distance = length((dot_center - u_pointer) / primary_scale);",
				"  float secondary_distance = length((dot_center - u_secondary) / secondary_scale);",
				"  float primary_field = 1.0 - smooth_field(0.08, 1.08, primary_distance);",
				"  float secondary_field = (1.0 - smooth_field(0.12, 1.14, secondary_distance)) * 0.36;",
				"  float diagonal_wave = 0.92 + 0.08 * sin((dot_center.x - dot_center.y) * 0.031 - u_time * 1.75 + cell.y * 0.08);",
				"  float strength = clamp(max(primary_field, secondary_field) * diagonal_wave, 0.0, 1.0);",
				"  float peak_radius = u_dot_mode == 2 ? 5.45 : 1.82;",
				"  float resting_radius = u_dot_mode == 2 ? 0.58 : 0.42;",
				"  float dot_radius = mix(resting_radius, peak_radius, pow(strength, 1.45));",
				"  float edge = 1.0 - smoothstep(max(0.0, dot_radius - 0.65), dot_radius + 0.3, length(local_position));",
				"  if (edge <= 0.0) {",
				"    out_color = vec4(vec3(0.9803922), 1.0);",
				"    return;",
				"  }",
				"  vec3 dot_color;",
				"  if (u_dot_mode == 1) {",
				"    dot_color = sample_circle_field(viewport_position);",
				"  } else {",
				"    float circle_radius = u_source_css.y * 0.059 * 1.7320508;",
				"    vec2 miniature_position = local_position / max(dot_radius, 0.001) * (u_scale * circle_radius * 6.0);",
				"    vec2 sample_x = dFdx(miniature_position) * 0.45;",
				"    vec2 sample_y = dFdy(miniature_position) * 0.45;",
				"    dot_color = sample_circle_field(miniature_position) * 4.0;",
				"    dot_color += sample_circle_field(miniature_position + sample_x) * 2.0;",
				"    dot_color += sample_circle_field(miniature_position - sample_x) * 2.0;",
				"    dot_color += sample_circle_field(miniature_position + sample_y) * 2.0;",
				"    dot_color += sample_circle_field(miniature_position - sample_y) * 2.0;",
				"    dot_color += sample_circle_field(miniature_position + sample_x + sample_y);",
				"    dot_color += sample_circle_field(miniature_position + sample_x - sample_y);",
				"    dot_color += sample_circle_field(miniature_position - sample_x + sample_y);",
				"    dot_color += sample_circle_field(miniature_position - sample_x - sample_y);",
				"    dot_color /= 16.0;",
				"  }",
				"  vec3 floor_color = vec3(0.9803922);",
				"  out_color = vec4(mix(floor_color, dot_color, edge), 1.0);",
				"}",
			].join("\\n");

			const compile = (type, source) => {
				const shader = gl.createShader(type);
				if (!shader) throw new Error("Could not allocate cone-warp shader.");
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
					throw new Error(gl.getShaderInfoLog(shader) || "Cone-warp shader compilation failed.");
				}
				return shader;
			};

			let program;
			try {
				const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
				const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
				program = gl.createProgram();
				if (!program) throw new Error("Could not allocate cone-warp program.");
				gl.attachShader(program, vertexShader);
				gl.attachShader(program, fragmentShader);
				gl.linkProgram(program);
				gl.deleteShader(vertexShader);
				gl.deleteShader(fragmentShader);
				if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
					throw new Error(gl.getProgramInfoLog(program) || "Cone-warp shader linking failed.");
				}
			} catch (error) {
				console.error(error);
				return false;
			}

			const texture = gl.createTexture();
			if (!texture) return false;
			gl.useProgram(program);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.uniform1i(gl.getUniformLocation(program, "u_frame"), 0);
			const viewportLocation = gl.getUniformLocation(program, "u_viewport_css");
			const sourceLocation = gl.getUniformLocation(program, "u_source_css");
			const scaleLocation = gl.getUniformLocation(program, "u_scale");
			const centerScaleLocation = gl.getUniformLocation(program, "u_center_scale");
			const showOuterLocation = gl.getUniformLocation(program, "u_show_outer");
			const showRefractionLocation = gl.getUniformLocation(program, "u_show_refraction");
			const showInnerLocation = gl.getUniformLocation(program, "u_show_inner");
			const showWhiteLocation = gl.getUniformLocation(program, "u_show_white");
			const dotModeLocation = gl.getUniformLocation(program, "u_dot_mode");
			const timeLocation = gl.getUniformLocation(program, "u_time");
			const pointerLocation = gl.getUniformLocation(program, "u_pointer");
			const secondaryLocation = gl.getUniformLocation(program, "u_secondary");
			const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
			const startedAt = performance.now();
			let previousFrameAt = startedAt;
			const pointer = {
				active: false,
				currentX: innerWidth * 0.33,
				currentY: innerHeight * 0.55,
				targetX: innerWidth * 0.33,
				targetY: innerHeight * 0.55,
			};
			let animationFrame;
			let hasFrame = false;

			const setPointerTarget = (event) => {
				if (!dotMode || (event.pointerType === "touch" && !pointer.active)) return;
				pointer.active = true;
				pointer.targetX = Math.min(innerWidth, Math.max(0, event.clientX));
				pointer.targetY = Math.min(innerHeight, Math.max(0, event.clientY));
			};
			const handlePointerDown = (event) => {
				if (!dotMode) return;
				pointer.active = true;
				setPointerTarget(event);
			};
			const handlePointerEnd = (event) => {
				if (event.pointerType === "touch") pointer.active = false;
			};
			const handlePointerOut = (event) => {
				if (!event.relatedTarget && event.pointerType !== "touch") pointer.active = false;
			};

			if (dotMode) {
				addEventListener("pointermove", setPointerTarget, { passive: true });
				addEventListener("pointerdown", handlePointerDown, { passive: true });
				addEventListener("pointerup", handlePointerEnd, { passive: true });
				addEventListener("pointercancel", handlePointerEnd, { passive: true });
				addEventListener("pointerout", handlePointerOut, { passive: true });
			}

			const resize = () => {
				const deviceRatio = Math.min(devicePixelRatio || 1, 2);
				const shaderDotRatio = Math.min(
					3,
					Math.sqrt(16000000 / Math.max(1, innerWidth * innerHeight)),
				);
				const ratio = dotMode === "shaders"
					? Math.max(deviceRatio, shaderDotRatio)
					: deviceRatio;
				const width = Math.max(1, Math.round(innerWidth * ratio));
				const height = Math.max(1, Math.round(innerHeight * ratio));
				if (canvas.width !== width || canvas.height !== height) {
					canvas.width = width;
					canvas.height = height;
					gl.viewport(0, 0, width, height);
				}
			};

			const render = (now) => {
				resize();
				const frameAt = Number.isFinite(now) ? now : performance.now();
				const elapsed = reducedMotion.matches ? 0 : frameAt - startedAt;
				const phase = elapsed / 6800 * Math.PI * 2;
				const idleX = innerWidth * (0.33 + 0.22 * Math.sin(phase));
				const idleY = innerHeight * (0.55 + 0.17 * Math.sin(phase * 0.83 - 0.25));
				const destinationX = pointer.active ? pointer.targetX : idleX;
				const destinationY = pointer.active ? pointer.targetY : idleY;
				const deltaTime = Math.min(64, Math.max(0, frameAt - previousFrameAt));
				const followStrength = reducedMotion.matches
					? 1
					: 1 - Math.exp(-deltaTime / (pointer.active ? 72 : 240));
				pointer.currentX += (destinationX - pointer.currentX) * followStrength;
				pointer.currentY += (destinationY - pointer.currentY) * followStrength;
				previousFrameAt = frameAt;
				const secondaryX = pointer.active
					? pointer.currentX + (idleX - pointer.currentX) * 0.42
					: innerWidth * (0.72 + 0.11 * Math.cos(phase * 0.71));
				const secondaryY = pointer.active
					? pointer.currentY + (idleY - pointer.currentY) * 0.42
					: innerHeight * (0.38 + 0.2 * Math.sin(phase * 0.61 + 1.4));
				const sourceRect = sourceCanvas.getBoundingClientRect();
				if (
					sourceCanvas.width > 300 &&
					sourceCanvas.height > 150 &&
					sourceRect.width > 0 &&
					sourceRect.height > 0
				) {
					try {
						gl.activeTexture(gl.TEXTURE0);
						gl.bindTexture(gl.TEXTURE_2D, texture);
						gl.texImage2D(
							gl.TEXTURE_2D,
							0,
							gl.RGBA,
							gl.RGBA,
							gl.UNSIGNED_BYTE,
							sourceCanvas,
						);
						gl.useProgram(program);
						gl.uniform2f(viewportLocation, innerWidth, innerHeight);
						gl.uniform2f(sourceLocation, sourceRect.width, sourceRect.height);
						gl.uniform1f(scaleLocation, fieldScale);
						gl.uniform1f(centerScaleLocation, centerScale);
						gl.uniform1f(showOuterLocation, layerVisibility.outer);
						gl.uniform1f(showRefractionLocation, layerVisibility.refraction);
						gl.uniform1f(showInnerLocation, layerVisibility.inner);
						gl.uniform1f(showWhiteLocation, dotMode ? layerVisibility.white : 0);
						gl.uniform1i(dotModeLocation, dotMode === "reveal" ? 1 : dotMode === "shaders" ? 2 : 0);
						gl.uniform1f(timeLocation, phase);
						gl.uniform2f(
							pointerLocation,
							pointer.currentX - innerWidth * 0.5,
							innerHeight * 0.5 - pointer.currentY,
						);
						gl.uniform2f(
							secondaryLocation,
							secondaryX - innerWidth * 0.5,
							innerHeight * 0.5 - secondaryY,
						);
						gl.drawArrays(gl.TRIANGLES, 0, 3);
						if (!hasFrame) {
							hasFrame = true;
							root.setAttribute(
								"data-circle-field-renderer",
								dotMode ? "native-dots-" + dotMode : "native-radial-warp",
							);
						}
					} catch (error) {
						root.setAttribute("data-circle-field-renderer", "native-warp-error");
						console.error("Could not sample the native color field.", error);
					}
				}
				animationFrame = requestAnimationFrame(render);
			};

			addEventListener("resize", resize, { passive: true });
			resize();
			animationFrame = requestAnimationFrame(render);
			addEventListener("pagehide", () => {
				cancelAnimationFrame(animationFrame);
				removeEventListener("pointermove", setPointerTarget);
				removeEventListener("pointerdown", handlePointerDown);
				removeEventListener("pointerup", handlePointerEnd);
				removeEventListener("pointercancel", handlePointerEnd);
				removeEventListener("pointerout", handlePointerOut);
			}, { once: true });
			return true;
		};

		const mount = () => {
			let mounted = false;
			const mountScaleControl = () => {
				const control = document.createElement("div");
				control.setAttribute("data-field-scale-control", "");
				control.setAttribute("role", "group");
				control.setAttribute("aria-label", "Field zoom and center scale controls");

				const createScaleRow = (labelText, id, inputAttribute, resetAttribute) => {
					const row = document.createElement("div");
					row.setAttribute("data-field-scale-row", "");

					const label = document.createElement("label");
					label.setAttribute("data-field-scale-label", "");
					label.setAttribute("for", id);
					label.textContent = labelText;

					const input = document.createElement("input");
					input.id = id;
					input.type = "range";
					input.min = "1";
					input.step = "1";
					input.value = "100";
					input.setAttribute(inputAttribute, "");

					const reset = document.createElement("button");
					reset.type = "button";
					reset.setAttribute(resetAttribute, "");

					row.append(label, input, reset);
					return { row, input, reset };
				};

				const zoom = createScaleRow(
					"Zoom",
					"field-total-scale",
					"data-field-scale-input",
					"data-field-scale-reset",
				);
				zoom.input.value = String(Math.round(fieldScale * 100));
				zoom.input.max = "160";
				zoom.input.setAttribute("aria-label", "Complete color field zoom");
				zoom.reset.setAttribute("aria-label", "Reset complete color field zoom to 100 percent");
				zoom.reset.title = "Reset zoom to 100%";

				const center = createScaleRow(
					"Center",
					"field-center-scale",
					"data-field-center-scale-input",
					"data-field-center-scale-reset",
				);
				center.input.value = String(Math.round(centerScale * 100));
				center.input.max = zoom.input.value;
				center.input.setAttribute("aria-label", "White center circle scale");

				const updateCenter = () => {
					const percentage = Math.min(Number(center.input.value), Number(center.input.max));
					center.input.value = String(percentage);
					centerScale = percentage / 100;
					center.reset.textContent = percentage + "%";
					center.input.setAttribute("aria-valuetext", percentage + "%");
					center.reset.setAttribute(
						"aria-label",
						"Match center scale to field zoom at " + zoom.input.value + " percent",
					);
					center.reset.title = "Match center to zoom (" + zoom.input.value + "%)";
					root.setAttribute("data-center-scale", centerScale.toFixed(2));
					syncWhiteCircleOverlay();
				};

				const updateZoom = () => {
					const previousPercentage = Math.round(fieldScale * 100);
					const centerWasMatched = Number(center.input.value) === previousPercentage;
					const percentage = Number(zoom.input.value);
					fieldScale = percentage / 100;
					zoom.reset.textContent = percentage + "%";
					zoom.input.setAttribute("aria-valuetext", percentage + "%");
					root.setAttribute("data-field-scale", fieldScale.toFixed(2));
					center.input.max = String(percentage);
					if (centerWasMatched || Number(center.input.value) > percentage) {
						center.input.value = String(percentage);
					}
					updateCenter();
				};

				zoom.input.addEventListener("input", updateZoom);
				center.input.addEventListener("input", updateCenter);
				zoom.reset.addEventListener("click", () => {
					zoom.input.value = "100";
					updateZoom();
					zoom.input.focus();
				});
				center.reset.addEventListener("click", () => {
					center.input.value = zoom.input.value;
					updateCenter();
					center.input.focus();
				});
				control.append(zoom.row, center.row);
				document.body.append(control);
				updateZoom();
			};
			const mountLayerControl = () => {
				const control = document.createElement("aside");
				control.setAttribute("data-field-layer-control", "");
				control.setAttribute("aria-label", "Color field layer visibility");

				const header = document.createElement("div");
				header.setAttribute("data-field-layer-header", "");
				const kicker = document.createElement("span");
				kicker.setAttribute("data-field-layer-kicker", "");
				kicker.textContent = "Debug";
				const title = document.createElement("strong");
				title.setAttribute("data-field-layer-title", "");
				title.textContent = "Layers";
				header.append(kicker, title);

				const list = document.createElement("div");
				list.setAttribute("data-field-layer-list", "");
				const definitions = [
					{ key: "outer", label: "Outer color" },
					{ key: "refraction", label: "Refraction" },
					{ key: "inner", label: "Inner cone" },
					{ key: "white", label: "White center" },
				];

				for (const definition of definitions) {
					const option = document.createElement("label");
					option.setAttribute("data-field-layer-option", "");
					const input = document.createElement("input");
					input.type = "checkbox";
					input.checked = true;
					input.setAttribute("data-field-layer-toggle", definition.key);
					input.setAttribute("aria-label", "Show " + definition.label.toLowerCase());
					const name = document.createElement("span");
					name.setAttribute("data-field-layer-name", "");
					name.textContent = definition.label;
					const state = document.createElement("span");
					state.setAttribute("data-field-layer-state", "");
					state.textContent = "On";

					input.addEventListener("change", () => {
						const enabled = input.checked;
						layerVisibility[definition.key] = enabled ? 1 : 0;
						state.textContent = enabled ? "On" : "Off";
						root.setAttribute("data-layer-" + definition.key, enabled ? "on" : "off");
					});
					option.append(input, name, state);
					list.append(option);
				}

				control.append(header, list);
				document.body.append(control);
			};
			const mountWhiteCircleOverlay = () => {
				const polygon = document.querySelector('polygon[fill="#000"]');
				const sourceSvg = polygon?.closest("svg");
				const sourceLayer = sourceSvg?.parentElement;
				if (!(sourceSvg instanceof SVGSVGElement) || !(sourceLayer instanceof HTMLElement)) {
					root.setAttribute("data-circle-overlay", "source-missing");
					return;
				}

				sourceLayer.setAttribute("data-circle-overlay-source", "");
				sourceLayer.style.setProperty("display", "block", "important");
				sourceLayer.style.setProperty("visibility", "hidden", "important");
				const overlay = document.createElement("div");
				overlay.setAttribute("data-field-circle-overlay", "");
				overlay.setAttribute("aria-hidden", "true");
				document.body.append(overlay);

				syncWhiteCircleOverlay = () => {
					const rect = sourceSvg.getBoundingClientRect();
					if (rect.width <= 0 || rect.height <= 0) return;
					const diameter = rect.width * 0.8660254038 * centerScale;
					overlay.style.width = diameter + "px";
					overlay.style.height = diameter + "px";
					overlay.style.left = rect.left + rect.width / 2 - diameter / 2 + "px";
					overlay.style.top = rect.top + rect.height / 2 - diameter / 2 + "px";
					root.setAttribute("data-circle-overlay", "mounted");
				};

				const resizeObserver = new ResizeObserver(syncWhiteCircleOverlay);
				resizeObserver.observe(sourceSvg);
				addEventListener("resize", syncWhiteCircleOverlay, { passive: true });
				syncWhiteCircleOverlay();
				setTimeout(syncWhiteCircleOverlay, 250);
				setTimeout(syncWhiteCircleOverlay, 1200);
				addEventListener("pagehide", () => resizeObserver.disconnect(), { once: true });
			};
			const createCanvas = () => {
				const canvas = document.createElement("canvas");
				canvas.setAttribute(
					"data-field-experiment-canvas",
					dotMode ? "dots-" + dotMode : "circle",
				);
				canvas.setAttribute(
					"aria-label",
					dotMode === "reveal"
						? "Pointer-reactive halftone revealing an RGB cone color field"
						: dotMode === "shaders"
							? "Pointer-reactive halftone made from miniature RGB cone shaders"
							: "Interactive top-down RGB cone color field",
				);
				canvas.setAttribute("role", "img");
				document.body.append(canvas);
				return canvas;
			};
			const mountFallback = () => {
				if (mounted) return;
				mounted = true;
				const canvas = createCanvas();
				if (!startProceduralCone(canvas)) {
					canvas.remove();
					root.setAttribute("data-field-procedural-error", "true");
				} else {
					root.setAttribute("data-circle-field-renderer", "procedural-fallback");
				}
			};
			const mountNativeWarp = () => {
				if (mounted) return true;
				const sourceCanvas = document.querySelector(
					'canvas[data-triangle-led-4-hero-canvas="true"]',
				);
				if (!(sourceCanvas instanceof HTMLCanvasElement)) return false;
				const canvas = createCanvas();
				if (!startNativeConeWarp(canvas, sourceCanvas)) {
					canvas.remove();
					mountFallback();
					return true;
				}
				mounted = true;
				usingNativeWarp = true;
				if (dotMode) {
					setTimeout(() => {
						for (const worker of workers) {
							worker.postMessage({ type: "click", click: { kind: "toggle" } });
						}
						root.setAttribute("data-dot-field-colors", "on");
					}, 600);
				}
				return true;
			};

			if (!mountNativeWarp()) {
				const observer = new MutationObserver(() => {
					if (mountNativeWarp()) observer.disconnect();
				});
				observer.observe(document.body, { childList: true, subtree: true });
				setTimeout(() => {
					observer.disconnect();
					mountFallback();
				}, 10000);
			}
			if (!dotMode) mountWhiteCircleOverlay();
			mountScaleControl();
			mountLayerControl();
		};

		document.addEventListener(
			"pointerup",
			(event) => {
				if (event.button !== 0 || !event.isPrimary) return;
				if (
					event.target instanceof Element &&
					event.target.closest(
						'a,button,input,select,textarea,label,[role="button"],[contenteditable="true"]',
					)
				) return;
				event.stopImmediatePropagation();
				if (dotMode) return;
				if (usingNativeWarp) {
					for (const worker of workers) {
						worker.postMessage({ type: "click", click: { kind: "toggle" } });
					}
				} else {
					toggleFallbackEnergy?.();
				}
			},
			true,
		);

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", mount, { once: true });
		} else {
			mount();
		}
	})()</script>`;

const blockedExternalScriptPattern =
	/(?:googletagmanager|google-analytics|vercel-insights|speed-insights|feedback\.js|fides|intercom|segment|datadog|149e9513-01fa-4fb0-aad4-566afd725d1b)/i;

const blockedInlineScriptPattern =
	/(?:KPSDK|__VERCEL_NAVIGATION_METRICS|datadog|google-analytics|googletagmanager|fides\.js)/i;

const stabilizeCapture = (html, options = {}) => {
	const hydrationReadyHtml = html
		.replace(
			/(<div aria-hidden="true" class="absolute inset-0 transition-opacity duration-700 ease-linear )opacity-0(")/i,
			"$1opacity-100$2",
		)
		.replace(
			/<div aria-hidden="true" class="absolute inset-0 z-0 pointer-events-none">\s*<canvas\b[^>]*data-triangle-led-4-hero-canvas="true"[^>]*>[\s\S]*?<\/canvas>\s*<div aria-hidden="true" class="absolute inset-0 pointer-events-none">\s*<\/div>\s*<\/div>/i,
			"",
		);

	const withoutNonessentialScripts = hydrationReadyHtml.replace(
		/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
		(fullTag, attributes, body) => {
			const source = attributes.match(/\bsrc=(['"])(.*?)\1/i)?.[2];
			if (source && blockedExternalScriptPattern.test(source)) return "";
			if (
				!source &&
				!body.includes("self.__next_f") &&
				blockedInlineScriptPattern.test(body)
			) {
				return "";
			}
			return fullTag;
		},
	);
	const routeBootstrap = options.displayPath
		? `<script data-vercel-reference-route-bootstrap>(()=>{const replace=history.replaceState.bind(history);replace(null,"",${JSON.stringify(options.shaderGui ? "/?shaderGui" : "/")});addEventListener("load",()=>setTimeout(()=>replace(null,"",${JSON.stringify(options.displayPath)}),${options.shaderGui ? 12000 : 1600}),{once:true})})()</script>`
		: "";
	const variantBootstrap = options.circleField
		? createCircleFieldBootstrap(options.dotMode || "")
		: options.triangleless
			? createTrianglelessBootstrap(options.fieldMethod || fieldMethodDefault)
			: options.colorField && options.displayPath
				? createColorFieldInspectorBootstrap(options.displayPath)
				: "";
	const themeBootstrap = options.forceLight
		? colorFieldLightThemeBootstrap
		: localReferenceBootstrap;
	const initializedHtml = /<head>/i.test(withoutNonessentialScripts)
		? withoutNonessentialScripts.replace(
				/<head>/i,
				`<head>${routeBootstrap}${themeBootstrap}${variantBootstrap}`,
			)
		: `${routeBootstrap}${themeBootstrap}${variantBootstrap}${withoutNonessentialScripts}`;
	const variantStyles = options.colorField ? colorFieldStyles : "";

	return /<\/head>/i.test(initializedHtml)
		? initializedHtml.replace(
				/<\/head>/i,
				`${localReferenceStyles}${variantStyles}</head>`,
			)
		: `${localReferenceStyles}${variantStyles}${initializedHtml}`;
};

const readCapture = async (request) => {
	const declaredLength = Number.parseInt(
		request.headers["content-length"] || "0",
		10,
	);
	if (declaredLength > maximumCaptureBytes) {
		throw new Error("Capture exceeds 24 MiB.");
	}

	const chunks = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		receivedBytes += chunk.length;
		if (receivedBytes > maximumCaptureBytes) {
			throw new Error("Capture exceeds 24 MiB.");
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
};

const saveCapture = async (request, response) => {
	try {
		const html = await readCapture(request);
		if (
			!/<html[\s>]/i.test(html) ||
			!html.includes('id="marketing-header"') ||
			!(
				html.includes('data-hero-static-fallback="triangle-led-4"') ||
				html.includes('data-triangle-led-4-hero-canvas="true"')
			) ||
			!html.includes("Agentic Infrastructure")
		) {
			throw new Error("The submitted document is not the Vercel homepage.");
		}

		await writeFile(temporaryCapturePath, html);
		await rename(temporaryCapturePath, capturePath);
		response.writeHead(201, {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		});
		response.end(
			JSON.stringify({
				bytes: Buffer.byteLength(html),
				ok: true,
				path: capturePath,
			}),
		);
		console.log(`Saved capture to ${capturePath}`);
	} catch (error) {
		response.writeHead(400, {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		});
		response.end(
			JSON.stringify({
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	}
};

const serveCapture = async (response, options = {}) => {
	const html = await readFile(capturePath, "utf8");
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		injectAgentation(
			stabilizeCapture(html, options),
			options.colorField ? "vercel-color-field" : "vercel-com",
		),
	);
};

const resolveFieldMethod = (value) =>
	fieldMethods.has(value) ? value : fieldMethodDefault;

const fieldMethodFromReferer = (referer) => {
	if (!referer) return undefined;
	try {
		return new URL(referer).searchParams.get(fieldMethodAssetFlag) || undefined;
	} catch {
		return undefined;
	}
};

const patchFieldMethodWorkerSource = (source, fieldMethod) => {
	if (fieldMethod === "point") {
		if (!source.includes(triangleHeightSource)) {
			console.warn(
				"Vercel triangle geometry changed; the point-collapse method may show its emitter.",
			);
			return source;
		}
		return source.replace(triangleHeightSource, trianglelessHeightSource);
	}

	return source;
};

const proxyVercelGet = async (request, response, requestUrl) => {
	const upstreamUrl = new URL(
		`${requestUrl.pathname}${requestUrl.search}`,
		vercelOrigin,
	);
	const requestedFieldMethod = resolveFieldMethod(
		requestUrl.searchParams.get(fieldMethodAssetFlag) ||
			fieldMethodFromReferer(request.headers.referer),
	);
	const isFieldMethodWorkerEntry =
		fieldMethodWorkerEntryPaths.has(requestUrl.pathname) &&
		(requestUrl.searchParams.has(fieldMethodAssetFlag) ||
			Boolean(fieldMethodFromReferer(request.headers.referer)));
	upstreamUrl.searchParams.delete(fieldMethodAssetFlag);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (
			value == null ||
			[
				"authorization",
				"connection",
				"cookie",
				"host",
				"origin",
				"referer",
			].includes(name)
		) {
			continue;
		}
		headers.set(name, Array.isArray(value) ? value.join(", ") : value);
	}

	const upstream = await fetch(upstreamUrl, {
		method: request.method,
		headers,
		redirect: "manual",
	});
	const responseHeaders = {};
	for (const name of [
		"accept-ranges",
		"cache-control",
		"content-range",
		"content-type",
		"etag",
		"last-modified",
	]) {
		const value = upstream.headers.get(name);
		if (value) responseHeaders[name] = value;
	}
	if (isFieldMethodWorkerEntry) {
		responseHeaders["cache-control"] = "no-store";
	}

	const location = upstream.headers.get("location");
	if (location) {
		const redirected = new URL(location, vercelOrigin);
		responseHeaders.location =
			redirected.origin === vercelOrigin
				? `${requestUrl.origin}${redirected.pathname}${redirected.search}${redirected.hash}`
				: redirected.href;
	}

	response.writeHead(upstream.status, responseHeaders);
	if (request.method === "HEAD" || !upstream.body) {
		response.end();
		return;
	}
	if (requestUrl.pathname === vercelOriginGuardChunkPath && upstream.ok) {
		const source = await upstream.text();
		if (!source.includes(vercelOriginGuardSource)) {
			console.warn(
				"Vercel origin guard changed; the local reference may redirect upstream.",
			);
			response.end(source);
			return;
		}
		response.end(source.replace(vercelOriginGuardSource, localOriginGuard));
		return;
	}
	if (isFieldMethodWorkerEntry && upstream.ok) {
		const source = await upstream.text();
		response.end(patchFieldMethodWorkerSource(source, requestedFieldMethod));
		return;
	}
	Readable.fromWeb(upstream.body).pipe(response);
};

createServer(async (request, response) => {
	const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);

	if (
		await handleAgentationRequest({
			request,
			response,
			requestUrl,
			site: "vercel-com",
		})
	) {
		return;
	}

	if (requestUrl.pathname === "/__capture" && request.method === "OPTIONS") {
		response.writeHead(204, corsHeaders);
		response.end();
		return;
	}

	if (requestUrl.pathname === "/__capture" && request.method === "POST") {
		await saveCapture(request, response);
		return;
	}

	if (
		["/", "/index.html"].includes(requestUrl.pathname) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Capture https://vercel.com/ first.\n`,
			);
			return;
		}
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveCapture(response);
		return;
	}

	if (
		[
			"/color-field/dots/reveal",
			"/color-field/dots/reveal/",
			"/color-field/dots/shaders",
			"/color-field/dots/shaders/",
		].includes(requestUrl.pathname) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Capture https://vercel.com/ first.\n`,
			);
			return;
		}
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveCapture(response, {
			circleField: true,
			colorField: true,
			displayPath: requestUrl.pathname,
			dotMode: requestUrl.pathname.includes("/shaders") ? "shaders" : "reveal",
			forceLight: true,
		});
		return;
	}

	if (
		["/color-field/circle", "/color-field/circle/"].includes(
			requestUrl.pathname,
		) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Capture https://vercel.com/ first.\n`,
			);
			return;
		}
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveCapture(response, {
			circleField: true,
			colorField: true,
			displayPath: requestUrl.pathname,
			forceLight: true,
		});
		return;
	}

	if (
		["/color-field/triangleless", "/color-field/triangleless/"].includes(
			requestUrl.pathname,
		) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Capture https://vercel.com/ first.\n`,
			);
			return;
		}
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		const fieldMethod = resolveFieldMethod(
			requestUrl.searchParams.get("method"),
		);
		await serveCapture(response, {
			colorField: true,
			displayPath: `${requestUrl.pathname}?method=${fieldMethod}`,
			fieldMethod,
			forceLight: true,
			triangleless: true,
		});
		return;
	}

	if (
		["/color-field", "/color-field/"].includes(requestUrl.pathname) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Capture https://vercel.com/ first.\n`,
			);
			return;
		}
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveCapture(response, {
			colorField: true,
			displayPath: requestUrl.pathname,
			forceLight: true,
			shaderGui: true,
		});
		return;
	}

	if (["GET", "HEAD"].includes(request.method || "")) {
		try {
			await proxyVercelGet(request, response, requestUrl);
		} catch (error) {
			response.writeHead(502, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Vercel asset proxy failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
		return;
	}

	response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
	response.end("Only the local capture endpoint accepts writes.\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Vercel header reference: http://127.0.0.1:${port}/`);
	console.log(`Captures save directly to ${capturePath}`);
	console.log(
		"Public Vercel assets are proxied read-only; press Ctrl+C to stop.",
	);
});
