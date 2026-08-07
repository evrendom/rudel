const CONTENT_DURATION = 180;
const OPEN_DELAY = 0;
const CLOSE_DELAY = 150;
const SKIP_DELAY = 300;

type MenuName = "product" | "resources";

const header = document.querySelector<HTMLElement>(".opaline-nav-header");
const desktopPortal = document.querySelector<HTMLElement>(
	"[data-opaline-navbar-desktop-portal]",
);
const mobileTemplate = document.querySelector<HTMLTemplateElement>(
	"template[data-opaline-navbar-mobile-template]",
);
const navbarScope = document.querySelector<HTMLElement>(
	"[data-opaline-navbar-scope]",
);
const triggers = Array.from(
	document.querySelectorAll<HTMLButtonElement>(
		'.opaline-nav-trigger[id*="trigger-"]',
	),
);

const menuForTrigger = (trigger: HTMLButtonElement): MenuName | null => {
	if (trigger.id.includes("trigger-product")) return "product";
	if (trigger.id.includes("trigger-resources")) return "resources";
	return null;
};

const sourcePortalFor = (menu: MenuName): HTMLElement | null => {
	const template = document.querySelector<HTMLTemplateElement>(
		`template[data-opaline-navbar-template="${menu}"]`,
	);
	const source = template?.content.firstElementChild;
	return source instanceof HTMLElement ? source : null;
};

const triggerFlags = new Map(
	triggers.map((trigger) => [
		trigger,
		{
			hasPointerMoveOpened: false,
			wasClickClose: false,
			wasEscapeClose: false,
		},
	]),
);

let activeMenu: MenuName | null = null;
let openTimer: number | undefined;
let closeTimer: number | undefined;
let cleanupTimer: number | undefined;
let skipDelayTimer: number | undefined;
let transitionId = 0;
let isOpenDelayed = true;
let mobileDialog: HTMLElement | null = null;

const clearTimer = (timer: number | undefined) => {
	if (timer !== undefined) window.clearTimeout(timer);
};

const setTriggerState = (menu: MenuName | null) => {
	for (const trigger of triggers) {
		const open = menuForTrigger(trigger) === menu;
		const state = open ? "open" : "closed";
		if (trigger.dataset.state !== state) trigger.dataset.state = state;
		if (trigger.getAttribute("aria-expanded") !== String(open)) {
			trigger.setAttribute("aria-expanded", String(open));
		}
	}
};

const setActiveTriggerOwnership = (
	trigger: HTMLButtonElement | undefined,
	contentId: string | undefined,
) => {
	for (const owner of document.querySelectorAll(
		"[data-opaline-navbar-owner]",
	)) {
		owner.remove();
	}
	if (!trigger || !contentId) return;
	const focusProxy = document.createElement("span");
	focusProxy.dataset.opalineNavbarOwner = "";
	focusProxy.setAttribute("aria-hidden", "true");
	focusProxy.tabIndex = 0;
	focusProxy.setAttribute(
		"style",
		"position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;",
	);
	const owner = document.createElement("span");
	owner.dataset.opalineNavbarOwner = "";
	owner.setAttribute("aria-owns", contentId);
	trigger.parentElement?.append(focusProxy, owner);
};

const updateOpenDelay = (menu: MenuName | null) => {
	clearTimer(skipDelayTimer);
	if (menu) {
		isOpenDelayed = false;
		return;
	}
	skipDelayTimer = window.setTimeout(() => {
		isOpenDelayed = true;
	}, SKIP_DELAY);
};

const setPortalCardHeight = (sourcePortal: HTMLElement) => {
	if (!desktopPortal) return;
	const cardHeight = sourcePortal.style.getPropertyValue("--inner-card-height");
	if (
		desktopPortal.style.getPropertyValue("--inner-card-height") !== cardHeight
	) {
		desktopPortal.style.setProperty("--inner-card-height", cardHeight);
	}
};

const setViewportGeometry = (
	sourceViewport: HTMLElement,
	viewport: HTMLElement,
) => {
	for (const property of [
		"--radix-navigation-menu-viewport-width",
		"--radix-navigation-menu-viewport-height",
	]) {
		const value = sourceViewport.style.getPropertyValue(property);
		if (viewport.style.getPropertyValue(property) !== value) {
			viewport.style.setProperty(property, value);
		}
	}
};

const finishSwitch = (id: number, nextContent: HTMLElement) => {
	if (id !== transitionId || !desktopPortal) return;
	for (const content of desktopPortal.querySelectorAll<HTMLElement>(
		".opaline-nav-content",
	)) {
		if (content !== nextContent) content.remove();
	}
};

const openMenu = (menu: MenuName) => {
	if (!desktopPortal || activeMenu === menu) return;
	clearTimer(closeTimer);
	clearTimer(cleanupTimer);

	const sourcePortal = sourcePortalFor(menu);
	const sourceViewport = sourcePortal?.firstElementChild;
	const sourceContent = sourceViewport?.firstElementChild;
	if (
		!sourcePortal ||
		!(sourceViewport instanceof HTMLElement) ||
		!(sourceContent instanceof HTMLElement)
	) {
		return;
	}

	const previousMenu = activeMenu;
	activeMenu = menu;
	setTriggerState(menu);
	updateOpenDelay(menu);
	setActiveTriggerOwnership(
		triggers.find((trigger) => menuForTrigger(trigger) === menu),
		sourceContent.id,
	);
	const id = ++transitionId;
	const viewport = desktopPortal.firstElementChild;

	if (!(viewport instanceof HTMLElement) || !previousMenu) {
		const firstViewport = sourceViewport.cloneNode(true);
		if (!(firstViewport instanceof HTMLElement)) return;
		delete firstViewport.querySelector<HTMLElement>(".opaline-nav-content")?.dataset
			.motion;
		firstViewport.removeAttribute("style");
		desktopPortal.replaceChildren(firstViewport);
		setPortalCardHeight(sourcePortal);
		setViewportGeometry(sourceViewport, firstViewport);
		return;
	}

	const movingForward = previousMenu === "product" && menu === "resources";
	const previousContent =
		viewport.querySelector<HTMLElement>(".opaline-nav-content");
	if (previousContent) {
		previousContent.dataset.motion = movingForward ? "to-start" : "to-end";
	}
	const nextContent = sourceContent.cloneNode(true);
	if (!(nextContent instanceof HTMLElement)) return;
	nextContent.dataset.motion = movingForward ? "from-end" : "from-start";
	setPortalCardHeight(sourcePortal);
	viewport.append(nextContent);
	window.setTimeout(() => {
		if (id === transitionId) setViewportGeometry(sourceViewport, viewport);
	}, 12);
	cleanupTimer = window.setTimeout(
		() => finishSwitch(id, nextContent),
		CONTENT_DURATION,
	);
};

const closeMenu = () => {
	clearTimer(openTimer);
	clearTimer(closeTimer);
	clearTimer(cleanupTimer);
	if (!desktopPortal || !activeMenu) return;
	activeMenu = null;
	setTriggerState(null);
	setActiveTriggerOwnership(undefined, undefined);
	updateOpenDelay(null);
	const id = ++transitionId;
	const viewport = desktopPortal.firstElementChild;
	if (viewport instanceof HTMLElement) {
		viewport.dataset.state = "closed";
		viewport.style.pointerEvents = "none";
	}
	cleanupTimer = window.setTimeout(() => {
		if (id === transitionId && activeMenu === null) {
			desktopPortal.replaceChildren();
		}
	}, CONTENT_DURATION);
};

const scheduleClose = () => {
	clearTimer(openTimer);
	clearTimer(closeTimer);
	closeTimer = window.setTimeout(closeMenu, CLOSE_DELAY);
};

const enterTrigger = (menu: MenuName) => {
	clearTimer(openTimer);
	clearTimer(closeTimer);
	if (!isOpenDelayed || activeMenu) {
		openMenu(menu);
		return;
	}
	openTimer = window.setTimeout(() => openMenu(menu), OPEN_DELAY);
};

for (const trigger of triggers) {
	trigger.addEventListener("pointerenter", () => {
		const flags = triggerFlags.get(trigger);
		if (!flags) return;
		flags.wasClickClose = false;
		flags.wasEscapeClose = false;
	});
	trigger.addEventListener("pointermove", (event) => {
		const flags = triggerFlags.get(trigger);
		const menu = menuForTrigger(trigger);
		if (
			event.pointerType !== "mouse" ||
			!flags ||
			!menu ||
			flags.hasPointerMoveOpened ||
			flags.wasClickClose ||
			flags.wasEscapeClose
		) {
			return;
		}
		flags.hasPointerMoveOpened = true;
		enterTrigger(menu);
	});
	trigger.addEventListener("pointerleave", (event) => {
		if (event.pointerType !== "mouse") return;
		const flags = triggerFlags.get(trigger);
		if (flags) flags.hasPointerMoveOpened = false;
		scheduleClose();
	});
	trigger.addEventListener("click", () => {
		const menu = menuForTrigger(trigger);
		if (menu) openMenu(menu);
	});
	trigger.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" && menuForTrigger(trigger) === activeMenu) {
			event.preventDefault();
			desktopPortal
				?.querySelector<HTMLAnchorElement>(".opaline-nav-content a")
				?.focus();
			return;
		}
		if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) {
			return;
		}
		event.preventDefault();
		const currentIndex = triggers.indexOf(trigger);
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? triggers.length - 1
					: (currentIndex +
							(event.key === "ArrowRight" ? 1 : -1) +
							triggers.length) %
						triggers.length;
		triggers[nextIndex]?.focus();
	});
}

desktopPortal?.addEventListener("pointerenter", () => {
	clearTimer(closeTimer);
});
desktopPortal?.addEventListener("pointerleave", scheduleClose);

const mobileTrigger = document.querySelector<HTMLButtonElement>(
	'.opaline-nav-mobile-trigger[aria-haspopup="dialog"]',
);

const setMobile = (open: boolean) => {
	if (!mobileTrigger || !mobileTemplate) return;
	mobileTrigger.setAttribute("aria-expanded", String(open));
	mobileTrigger.dataset.state = open ? "open" : "closed";
	if (open) {
		if (mobileDialog) return;
		const dialog = mobileTemplate.content.firstElementChild?.cloneNode(true);
		if (!(dialog instanceof HTMLElement)) return;
		mobileDialog = dialog;
		(navbarScope ?? document.body).append(dialog);
		document.body.style.pointerEvents = "none";
		return;
	}
	if (!mobileDialog) return;
	mobileDialog.dataset.state = "closed";
	const closingDialog = mobileDialog;
	mobileDialog = null;
	window.setTimeout(() => {
		closingDialog.remove();
		document.body.style.pointerEvents = "";
	}, CONTENT_DURATION);
};

mobileTrigger?.addEventListener("click", () => {
	closeMenu();
	setMobile(mobileTrigger.dataset.state !== "open");
});

document.addEventListener("pointerdown", (event) => {
	if (!(event.target instanceof Node)) return;
	if (
		activeMenu &&
		!header?.contains(event.target) &&
		!desktopPortal?.contains(event.target)
	) {
		closeMenu();
	}
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	const openTrigger = triggers.find(
		(trigger) => menuForTrigger(trigger) === activeMenu,
	);
	const focusWasInMenu =
		desktopPortal?.contains(document.activeElement) ?? false;
	if (openTrigger) {
		const flags = triggerFlags.get(openTrigger);
		if (flags) flags.wasEscapeClose = true;
	}
	closeMenu();
	setMobile(false);
	if (focusWasInMenu) openTrigger?.focus();
});

document.addEventListener("click", (event) => {
	if (!(event.target instanceof Element)) return;
	if (event.target.closest(".opaline-nav-content a")) closeMenu();
	if (mobileDialog?.contains(event.target) && event.target.closest("a")) {
		setMobile(false);
	}
});

window
	.matchMedia("(min-width: 769px)")
	.addEventListener("change", ({ matches }) => {
		if (matches) setMobile(false);
		else closeMenu();
	});
