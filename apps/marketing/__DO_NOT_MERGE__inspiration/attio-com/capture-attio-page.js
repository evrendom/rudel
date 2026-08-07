/**
 * Attio homepage exporter.
 *
 * Paste this entire file into DevTools Console on https://attio.com/ while the
 * companion local receiver is running. Temporary design reference only.
 */

(async () => {
	const options = {
		outputName: "attio-home.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4180/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (sourceUrl.hostname !== "attio.com" || sourceUrl.pathname !== "/") {
		throw new Error("Run this exporter on https://attio.com/.");
	}

	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(
			`Could not fetch the Attio source: HTTP ${sourceResponse.status}`,
		);
	}

	const html = await sourceResponse.text();
	if (
		!/<html[\s>]/i.test(html) ||
		!html.includes("Welcome to agentic revenue") ||
		!html.includes("/_next/static/")
	) {
		throw new Error(
			"Attio returned an unexpected document; capture was not saved.",
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

	console.info("Attio reference capture complete", {
		bytes: new Blob([html]).size,
		localSaveError,
		savedTo,
	});
})().catch((error) => {
	console.error("Attio reference capture failed.", error);
});
