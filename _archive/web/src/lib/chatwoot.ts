type ChatwootSDK = {
	run: (config: { websiteToken: string; baseUrl: string }) => void;
};

type ChatwootUser = {
	email?: string;
	name?: string;
	avatar_url?: string;
	phone_number?: string;
	description?: string;
	company_name?: string;
};

type ChatwootAPI = {
	hasLoaded?: boolean;
	toggle: (state?: "open" | "close") => void;
	toggleBubbleVisibility?: (visibility: ChatwootBubbleVisibility) => void;
	setUser: (identifier: string | number, user: ChatwootUser) => void;
	setLabel: (label: string) => void;
	reset: () => void;
};

type ChatwootBubbleVisibility = "show" | "hide";

type ChatwootConfig = {
	baseUrl: string;
	websiteToken: string;
	enabled: boolean;
};

declare global {
	interface Window {
		chatwootSDK?: ChatwootSDK;
		$chatwoot?: ChatwootAPI;
	}
}

const SCRIPT_ID = "rudel-chatwoot-sdk";
const LOAD_TIMEOUT_MS = 5_000;

export const CHATWOOT_OPENED_EVENT = "chatwoot:opened";
export const CHATWOOT_CLOSED_EVENT = "chatwoot:closed";

let loadPromise: Promise<void> | null = null;

function getChatwootConfig(): ChatwootConfig | null {
	const baseUrl = (import.meta.env.VITE_CHATWOOT_BASE_URL ?? "").trim();
	const websiteToken = (
		import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN ?? ""
	).trim();
	const enabled =
		(import.meta.env.VITE_CHATWOOT_ENABLED ?? "true").trim() !== "false";

	if (!enabled || baseUrl.length === 0 || websiteToken.length === 0) {
		return null;
	}

	return { baseUrl, websiteToken, enabled };
}

function getScriptUrl(baseUrl: string) {
	return `${baseUrl.replace(/\/$/, "")}/packs/js/sdk.js`;
}

function delay(ms: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

async function waitForChatwoot() {
	const startedAt = Date.now();

	while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
		if (window.$chatwoot?.hasLoaded) {
			return;
		}
		await delay(50);
	}

	throw new Error("Timed out waiting for Chatwoot to initialize");
}

function runChatwoot(config: ChatwootConfig) {
	if (!window.chatwootSDK) {
		throw new Error("Chatwoot SDK failed to load");
	}

	window.chatwootSDK.run({
		websiteToken: config.websiteToken,
		baseUrl: config.baseUrl,
	});
}

function dispatchChatwootStateEvent(eventName: string) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new Event(eventName));
}

export function isChatwootEnabled() {
	return getChatwootConfig() !== null;
}

export async function ensureChatwootLoaded(): Promise<void> {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return;
	}

	const config = getChatwootConfig();
	if (!config) {
		return;
	}

	if (window.$chatwoot?.hasLoaded) {
		return;
	}

	if (loadPromise) {
		return loadPromise;
	}

	if (window.$chatwoot) {
		loadPromise = waitForChatwoot();
		return loadPromise.catch((error) => {
			loadPromise = null;
			throw error;
		});
	}

	loadPromise = new Promise<void>((resolve, reject) => {
		const existingScript = document.getElementById(
			SCRIPT_ID,
		) as HTMLScriptElement | null;

		const startWidget = () => {
			try {
				runChatwoot(config);
				void waitForChatwoot().then(resolve, reject);
			} catch (error) {
				reject(error);
			}
		};

		if (existingScript) {
			if (window.chatwootSDK) {
				startWidget();
				return;
			}

			existingScript.addEventListener("load", startWidget, { once: true });
			existingScript.addEventListener(
				"error",
				() => reject(new Error("Chatwoot SDK failed to load")),
				{ once: true },
			);
			return;
		}

		const script = document.createElement("script");
		script.id = SCRIPT_ID;
		script.async = true;
		script.src = getScriptUrl(config.baseUrl);
		script.addEventListener("load", startWidget, { once: true });
		script.addEventListener(
			"error",
			() => reject(new Error("Chatwoot SDK failed to load")),
			{ once: true },
		);

		document.head.appendChild(script);
	});

	await loadPromise.catch((error) => {
		loadPromise = null;
		throw error;
	});
}

export async function openChatwoot() {
	try {
		await ensureChatwootLoaded();
		const api = window.$chatwoot;
		if (!api) {
			return;
		}

		api.toggle("open");
		dispatchChatwootStateEvent(CHATWOOT_OPENED_EVENT);
	} catch {
		// Ignore widget load failures so the dashboard remains functional.
	}
}

export async function closeChatwoot() {
	try {
		await ensureChatwootLoaded();
		const api = window.$chatwoot;
		if (!api) {
			return;
		}

		api.toggle("close");
		dispatchChatwootStateEvent(CHATWOOT_CLOSED_EVENT);
	} catch {
		// Ignore widget load failures so the dashboard remains functional.
	}
}

export async function setChatwootBubbleVisibility(
	visibility: ChatwootBubbleVisibility,
) {
	try {
		await ensureChatwootLoaded();
		window.$chatwoot?.toggleBubbleVisibility?.(visibility);
	} catch {
		// Keep the dashboard usable even if Chatwoot is unavailable.
	}
}

export async function syncChatwootUser(user: {
	identifier: string | number;
	email?: string | null;
	name?: string | null;
	avatarUrl?: string | null;
	organizationName?: string | null;
}) {
	try {
		await ensureChatwootLoaded();

		const api = window.$chatwoot;
		if (!api) {
			return;
		}

		const contact: ChatwootUser = {
			email: user.email?.trim() || undefined,
			name: user.name?.trim() || undefined,
			avatar_url: user.avatarUrl?.trim() || undefined,
			company_name: user.organizationName?.trim() || undefined,
			description: user.organizationName?.trim()
				? `Rudel dashboard user from ${user.organizationName}`
				: "Rudel dashboard user",
		};

		if (!contact.email && !contact.name && !contact.avatar_url) {
			return;
		}

		api.setUser(user.identifier, contact);
		api.setLabel("rudel-dashboard");
	} catch {
		// Keep the dashboard usable even if Chatwoot is unavailable.
	}
}

export function resetChatwoot() {
	window.$chatwoot?.reset();
}
