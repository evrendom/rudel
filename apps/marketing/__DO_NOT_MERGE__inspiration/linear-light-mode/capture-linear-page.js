/**
 * Linear /next light-mode reference exporter.
 *
 * Run this entire file in DevTools Console on https://linear.app/next while
 * the companion local receiver is running. It saves directly into this folder
 * and falls back to a normal Chrome download only when the receiver is absent.
 *
 * This is temporary reference material. Do not ship it with Opaline.
 */

(async () => {
	const options = {
		outputName: "linear-next-light.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4176/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (sourceUrl.hostname !== "linear.app" || sourceUrl.pathname !== "/next") {
		throw new Error("Run this exporter on https://linear.app/next.");
	}

	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(
			`Could not fetch the Linear source: HTTP ${sourceResponse.status}`,
		);
	}

	let html = await sourceResponse.text();
	if (
		!/<html[\s>]/i.test(html) ||
		!html.includes("https://static.linear.app/web/_next/static/")
	) {
		throw new Error("Linear returned an unexpected document; capture was not saved.");
	}

	const adoptedCss = [...document.adoptedStyleSheets]
		.map((sheet) => {
			try {
				return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
			} catch {
				return "";
			}
		})
		.filter(Boolean)
		.join("\n");

	const lightModeBootstrap = `<script data-opaline-linear-light-bootstrap>
(() => {
  try { localStorage.setItem("website-theme", "light"); } catch {}
  const root = document.documentElement;
  root.dataset.theme = "light";
  root.style.colorScheme = "light";
  root.classList.add("enhanced", "logged-in", "js");
})();
</script>`;

	// Change the server shell too, so light colors are correct before the first
	// script executes. The RSC payload remains untouched and Linear's own theme
	// bootstrap reads the light preference installed above.
	html = html.replace(
		/(<html\b[^>]*\bdata-theme=["'])[^"']*(["'])/i,
		"$1light$2",
	);
	html = html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${lightModeBootstrap}`);

	if (adoptedCss) {
		const capturedAdoptedStyle = `<style data-opaline-captured-adopted-styles>\n${adoptedCss.replaceAll("</style", "<\\/style")}\n</style>`;
		html = html.replace(
			/<\/head>/i,
			`${capturedAdoptedStyle}</head>`,
		);
	}

	let savedTo = null;
	let localSaveError = null;
	try {
		const response = await fetch(options.localSaveEndpoint, {
			method: "POST",
			mode: "cors",
			credentials: "omit",
			headers: { "content-type": "text/html;charset=UTF-8" },
			body: html,
		});
		if (!response.ok) {
			throw new Error(`Local receiver returned HTTP ${response.status}`);
		}
		const result = await response.json();
		savedTo = result.path;
	} catch (error) {
		localSaveError = error;
		if (!options.fallbackToBrowserDownload) throw error;

		const blob = new Blob([html], { type: "text/html;charset=utf-8" });
		const downloadUrl = URL.createObjectURL(blob);
		const download = document.createElement("a");
		download.href = downloadUrl;
		download.download = options.outputName;
		download.style.display = "none";
		document.body.append(download);
		download.click();
		download.remove();
		window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
	}

	console.group("Linear light-mode reference capture complete");
	if (savedTo) {
		console.log(`Saved directly to ${savedTo}`);
	} else {
		console.log(`Downloaded ${options.outputName} through Chrome.`);
		console.warn(
			"The local receiver was unavailable, so the absolute-path save could not be used.",
			localSaveError,
		);
	}
	console.log(`Captured ${document.adoptedStyleSheets.length} adopted stylesheets.`);
	console.log("Theme: forced light; navbar presentation: logged-in variant");
	console.log("Open http://127.0.0.1:4176/next; do not use file://.");
	console.groupEnd();
})().catch((error) => {
	console.error("Linear light-mode reference capture failed.", error);
});
