export const MYMIND_ACHIEVEMENTS_STYLES_URL =
	"https://static.accelerator.net/134/0.94.1/styles/achievements.css";
export const MYMIND_GSAP_SCRIPT_URL =
	"https://static.accelerator.net/134/0.94.1/scripts/vendor/gsap.min.js";
export const MYMIND_TRADING_CARD_SCRIPT_URL =
	"https://static.accelerator.net/134/0.94.1/tcg/assets/scripts/full_scene_tweak3.js";
export const MYMIND_CLOUD_AUDIO_URL =
	"https://static.accelerator.net/134/0.94.1/achievements/mp3/cloud_sound.mp3";

type TradingCardOptionValue =
	| boolean
	| HTMLElement
	| null
	| number
	| string
	| undefined;

export interface MymindTradingCardOptions {
	container: HTMLElement | null;
	datGuiActivated: boolean;
	description: string;
	descriptionColor: string;
	level: number;
	preventReveal: boolean;
	rootUrl: string;
	title: string;
	titleColor: string;
	[key: string]: TradingCardOptionValue;
}

export interface MymindTradingCardInstance {
	dispose(): void;
}

declare global {
	interface Window {
		TradingCard?: new (
			options: MymindTradingCardOptions,
		) => MymindTradingCardInstance;
		allowAnotherClick?: () => void;
		rootPivotAnimation?: (fullTurn?: boolean) => void;
		rootRevealScene?: () => void;
	}
}

function findScriptBySource(source: string) {
	return Array.from(document.scripts).find((script) => script.src === source);
}

function findStylesheetByHref(href: string) {
	return Array.from(
		document.querySelectorAll('link[rel="stylesheet"]'),
	).find((node) => node instanceof HTMLLinkElement && node.href === href);
}

export function ensureExternalScript(source: string) {
	return new Promise<void>((resolve, reject) => {
		const existing = findScriptBySource(source);

		if (existing instanceof HTMLScriptElement) {
			if (existing.dataset.loaded === "true") {
				resolve();
				return;
			}

			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener(
				"error",
				() => reject(new Error(`Failed to load ${source}`)),
				{ once: true },
			);
			return;
		}

		const script = document.createElement("script");
		script.src = source;
		script.async = true;
		script.dataset.rudelExternal = "true";
		script.addEventListener(
			"load",
			() => {
				script.dataset.loaded = "true";
				resolve();
			},
			{ once: true },
		);
		script.addEventListener(
			"error",
			() => reject(new Error(`Failed to load ${source}`)),
			{ once: true },
		);
		document.head.appendChild(script);
	});
}

export function ensureExternalStylesheet(href: string) {
	const existing = findStylesheetByHref(href);

	if (existing instanceof HTMLLinkElement) {
		return () => {};
	}

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	link.dataset.rudelExternal = "true";
	document.head.appendChild(link);

	return () => {
		link.remove();
	};
}
