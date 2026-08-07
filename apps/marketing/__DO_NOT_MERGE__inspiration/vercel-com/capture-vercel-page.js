/**
 * Vercel homepage source-document exporter.
 *
 * Paste this entire file into DevTools Console on https://vercel.com/ while
 * the companion local receiver is running. Temporary design reference only.
 */

(async () => {
	const options = {
		outputName: "vercel-home.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4181/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (sourceUrl.hostname !== "vercel.com" || sourceUrl.pathname !== "/") {
		throw new Error("Run this exporter on https://vercel.com/.");
	}

	await document.fonts.ready;
	await new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(resolve)),
	);

	const canvas = document.querySelector(
		'canvas[data-triangle-led-4-hero-canvas="true"]',
	);
	if (!canvas || canvas.width === 0 || canvas.height === 0) {
		throw new Error("The Vercel hero color canvas is not initialized.");
	}

	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(
			`Could not fetch the Vercel source: HTTP ${sourceResponse.status}`,
		);
	}
	const html = await sourceResponse.text();
	if (
		!html.includes('id="marketing-header"') ||
		!html.includes('data-hero-static-fallback="triangle-led-4"') ||
		!html.includes("Agentic Infrastructure") ||
		!html.includes("/vc-ap-vercel-marketing/_next/static/")
	) {
		throw new Error(
			"Vercel returned an unexpected document; capture was not saved.",
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

	console.info("Vercel header reference capture complete", {
		bytes: new Blob([html]).size,
		canvas: { height: canvas.height, width: canvas.width },
		localSaveError,
		savedTo,
	});
})().catch((error) => {
	console.error("Vercel header reference capture failed.", error);
});
