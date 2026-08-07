/**
 * Atoms homepage exporter.
 *
 * Paste this entire file into DevTools Console on https://atoms.co/ while the
 * companion local receiver is running. Temporary design reference only.
 */

(async () => {
	const options = {
		outputName: "atoms-home.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4179/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	if (sourceUrl.hostname !== "atoms.co" || sourceUrl.pathname !== "/") {
		throw new Error("Run this exporter on https://atoms.co/.");
	}

	const sourceResponse = await fetch(sourceUrl.href, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { accept: "text/html" },
	});
	if (!sourceResponse.ok) {
		throw new Error(
			`Could not fetch the Atoms source: HTTP ${sourceResponse.status}`,
		);
	}
	const html = await sourceResponse.text();
	if (
		!html.includes('data-framer-name="hero-section"') ||
		!html.includes('data-framer-name="companies-section"')
	) {
		throw new Error("The expected Atoms hero composition was not found.");
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
		const anchor = document.createElement("a");
		anchor.href = downloadUrl;
		anchor.download = options.outputName;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
	}

	console.info("Atoms reference capture complete", {
		bytes: new Blob([html]).size,
		localSaveError,
		savedTo,
	});
})();
