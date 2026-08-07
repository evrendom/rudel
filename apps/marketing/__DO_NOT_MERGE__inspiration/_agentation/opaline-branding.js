const wordmarkUrl = new URL("/__opaline/wordmark.svg", window.location.origin).href;
const iconUrl = new URL("/__opaline/icon.svg", window.location.origin).href;
const faviconUrl = new URL("/__opaline/favicon.svg", window.location.origin).href;

const selectors = [
	[
		'svg[aria-label="Interfere"], svg[aria-label="Lens"], svg[aria-label="Linear"]',
		"wordmark",
	],
	[
		'svg[aria-label="Lens wordmark"], svg[aria-label="Linear wordmark"], svg[class*="footerLogo"]',
		"wordmark",
	],
	[
		'svg[aria-label="Interfere Logo"], svg[aria-label="Interfere logo"], svg[aria-label="Lens Logo"], svg[aria-label="Lens logo"], svg[aria-label="Linear Logo"], svg[aria-label="Linear logo"]',
		"icon",
	],
	['a[class*="__iwFn6W__logo"] > svg', "wordmark"],
	['header a[class*="logo"] > svg, nav a[class*="logo"] > svg', "wordmark"],
	['footer a[class*="logo"] > svg', "icon"],
	['header a[class*="logo"] > img, nav a[class*="logo"] > img', "wordmark"],
	['footer a[class*="logo"] > img', "icon"],
];

const cssLength = (element, name, fallback) => {
	const measured = element.getBoundingClientRect()[name];
	if (measured > 0) return `${measured}px`;

	const attribute = element.getAttribute(name);
	if (attribute) {
		return /^-?(?:\d+|\d*\.\d+)$/.test(attribute)
			? `${attribute}px`
			: attribute;
	}
	return fallback;
};

const replaceGraphic = (graphic, type) => {
	if (graphic.dataset.opalineBrand != null) return;

	const originalFill = [graphic, ...graphic.querySelectorAll("[fill]")]
		.map((element) => element.getAttribute("fill"))
		.find(
			(fill) =>
				fill &&
				!["none", "transparent", "currentcolor"].includes(fill.toLowerCase()) &&
				!fill.startsWith("url("),
		);
	const replacement = document.createElement("span");
	const className = graphic.getAttribute("class");
	const style = graphic.getAttribute("style");
	if (className) replacement.setAttribute("class", className);
	if (style) replacement.setAttribute("style", style);
	replacement.dataset.opalineBrand = type;
	replacement.setAttribute("role", "img");
	replacement.setAttribute("aria-label", "Opaline");
	replacement.style.setProperty("display", "inline-block");
	replacement.style.setProperty("width", cssLength(graphic, "width", type === "wordmark" ? "96px" : "20px"));
	replacement.style.setProperty("height", cssLength(graphic, "height", type === "wordmark" ? "24px" : "20px"));
	replacement.style.setProperty("max-width", "100%");
	replacement.style.setProperty("flex", "0 0 auto");
	replacement.style.setProperty("background-color", originalFill || "currentColor");
	replacement.style.setProperty(
		"-webkit-mask",
		`url(${type === "wordmark" ? wordmarkUrl : iconUrl}) center / contain no-repeat`,
	);
	replacement.style.setProperty(
		"mask",
		`url(${type === "wordmark" ? wordmarkUrl : iconUrl}) center / contain no-repeat`,
	);
	graphic.replaceWith(replacement);
};

const replaceTextLockups = () => {
	for (const anchor of document.querySelectorAll(
		'header a[class*="logo"], nav a[class*="logo"], footer a[class*="logo"]',
	)) {
		if (anchor.querySelector("[data-opaline-brand], svg, img")) continue;
		if (!/^(interfere|lens|linear)$/i.test(anchor.textContent.trim())) continue;
		const replacement = document.createElement("span");
		replacement.dataset.opalineBrand = "wordmark";
		replacement.setAttribute("role", "img");
		replacement.setAttribute("aria-label", "Opaline");
		replacement.style.cssText = `display:block;width:96px;height:24px;background:currentColor;-webkit-mask:url(${wordmarkUrl}) center/contain no-repeat;mask:url(${wordmarkUrl}) center/contain no-repeat`;
		anchor.replaceChildren(replacement);
	}
};

const applyBranding = () => {
	if (!document.querySelector("link[data-opaline-favicon]")) {
		const favicon = document.createElement("link");
		favicon.rel = "icon";
		favicon.type = "image/svg+xml";
		favicon.href = faviconUrl;
		favicon.dataset.opalineFavicon = "";
		document.head.append(favicon);
	}

	for (const [selector, type] of selectors) {
		for (const graphic of document.querySelectorAll(selector)) {
			replaceGraphic(graphic, type);
		}
	}
	replaceTextLockups();
};

let frame = 0;
const scheduleBranding = () => {
	cancelAnimationFrame(frame);
	frame = requestAnimationFrame(applyBranding);
};

new MutationObserver(scheduleBranding).observe(document.documentElement, {
	childList: true,
	subtree: true,
});

scheduleBranding();
addEventListener("load", scheduleBranding, { once: true });
