/**
 * Lens reference-page exporter.
 *
 * Run this entire file in DevTools Console on https://lens.xyz/build while
 * the companion local server is running. The receiver writes the original
 * server document directly into this folder; otherwise Chrome downloads it.
 *
 * This is temporary reference material. Do not ship it with Opaline.
 */

(async () => {
	const options = {
		outputName: "lens-build.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4175/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (sourceUrl.hostname !== "lens.xyz" || sourceUrl.pathname !== "/build") {
		throw new Error("Run this exporter on https://lens.xyz/build.");
	}

	// Use the pristine server document, not outerHTML. The server document still
	// contains Lens's executable Next.js runtime, so mount-time transitions,
	// event listeners, dynamic canvases, and Three.js/WebGL scenes initialize
	// normally when the local reference is loaded.
	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(`Could not fetch the Lens source: HTTP ${sourceResponse.status}`);
	}

	const html = await sourceResponse.text();
	if (!/<html[\s>]/i.test(html) || !html.includes("/_next/static/")) {
		throw new Error("Lens returned an unexpected document; capture was not saved.");
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

	console.group("Lens reference capture complete");
	if (savedTo) {
		console.log(`Saved directly to ${savedTo}`);
	} else {
		console.log(`Downloaded ${options.outputName} through Chrome.`);
		console.warn(
			"The local receiver was unavailable, so the absolute-path save could not be used.",
			localSaveError,
		);
	}
	console.log("Runtime mode: original Lens startup runtime");
	console.log("Open http://127.0.0.1:4175/build; do not use file://.");
	console.groupEnd();
})().catch((error) => {
	console.error("Lens reference capture failed.", error);
});
