/**
 * Lens Developer Dashboard reference-page exporter.
 *
 * Run this entire file in DevTools Console on https://developer.lens.xyz/
 * while serve-developer-new.mjs is running. The receiver writes the pristine
 * server document into this folder; otherwise Chrome downloads it.
 *
 * This is temporary reference material. Do not ship it with Opaline.
 */

(async () => {
	const options = {
		outputName: "lens-developer-new.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4177/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (
		sourceUrl.hostname !== "developer.lens.xyz" ||
		sourceUrl.pathname !== "/"
	) {
		throw new Error(
			"Run this exporter on https://developer.lens.xyz/.",
		);
	}

	// Capture the original document rather than the hydrated DOM. This keeps
	// Next.js startup, event listeners, Three.js canvases, and mount animations.
	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(
			`Could not fetch the Lens Developer source: HTTP ${sourceResponse.status}`,
		);
	}

	const html = await sourceResponse.text();
	if (
		!/<html[\s>]/i.test(html) ||
		!html.includes("Lens Developer Dashboard") ||
		!html.includes("/_next/static/")
	) {
		throw new Error(
			"Lens Developer returned an unexpected document; capture was not saved.",
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

	console.group("Lens Developer reference capture complete");
	if (savedTo) {
		console.log(`Saved directly to ${savedTo}`);
	} else {
		console.log(`Downloaded ${options.outputName} through Chrome.`);
		console.warn(
			"The local receiver was unavailable, so the absolute-path save could not be used.",
			localSaveError,
		);
	}
	console.log("Runtime mode: original Lens Developer startup runtime");
	console.log("Open http://127.0.0.1:4177/; do not use file://.");
	console.groupEnd();

	return { savedTo, outputName: options.outputName };
})().catch((error) => {
	console.error("Lens Developer reference capture failed.", error);
	throw error;
});
