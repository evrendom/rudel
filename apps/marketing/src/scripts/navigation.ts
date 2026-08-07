const header = document.querySelector<HTMLElement>("[data-site-header]");
const triggers = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-nav-trigger]"),
);
const popoverPosition = document.querySelector<HTMLElement>(
	"[data-nav-popover-position]",
);
const popover = document.querySelector<HTMLElement>("[data-nav-popover]");
const panels = Array.from(
	document.querySelectorAll<HTMLElement>("[data-nav-panel]"),
);
const CONTENT_DURATION = 180;
const OPEN_DELAY = 200;
const CLOSE_DELAY = 150;
const SKIP_DELAY = 300;
const menuOrder = new Map([
	["product", 0],
	["resources", 1],
]);

let activeMenu: string | null = null;
let openTimer: number | undefined;
let closeTimer: number | undefined;
let skipDelayTimer: number | undefined;
let cleanupTimer: number | undefined;
let transitionId = 0;
let isOpenDelayed = true;

const triggerState = new Map(
	triggers.map((trigger) => [
		trigger,
		{
			hasPointerMoveOpened: false,
			wasClickClose: false,
			wasEscapeClose: false,
		},
	]),
);

const cancelOpen = () => {
	if (openTimer !== undefined) window.clearTimeout(openTimer);
	openTimer = undefined;
};

const cancelClose = () => {
	if (closeTimer !== undefined) window.clearTimeout(closeTimer);
	closeTimer = undefined;
};

const setTriggerState = (menu: string | null) => {
	for (const trigger of triggers) {
		const open = trigger.dataset.navTrigger === menu;
		trigger.setAttribute("aria-expanded", String(open));
		trigger.dataset.state = open ? "open" : "closed";
	}
};

const updateOpenDelay = (menu: string | null) => {
	if (skipDelayTimer !== undefined) window.clearTimeout(skipDelayTimer);
	if (menu !== null) {
		isOpenDelayed = false;
		return;
	}
	skipDelayTimer = window.setTimeout(() => {
		isOpenDelayed = true;
	}, SKIP_DELAY);
};

const finishPanelMotion = (id: number, visibleMenu: string | null) => {
	if (id !== transitionId) return;
	for (const panel of panels) {
		const visible = panel.dataset.navPanel === visibleMenu;
		panel.hidden = !visible;
		delete panel.dataset.motion;
	}
};

const openMenu = (menu: string) => {
	if (!popover || !popoverPosition || activeMenu === menu) return;
	cancelClose();
	if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);

	const previousMenu = activeMenu;
	const wasClosed =
		popoverPosition.hidden || popover.dataset.state === "closed";
	const id = ++transitionId;
	activeMenu = menu;
	updateOpenDelay(menu);
	setTriggerState(menu);

	popoverPosition.hidden = false;
	popover.dataset.menu = menu;
	popover.dataset.state = "open";

	const nextPanel = panels.find((panel) => panel.dataset.navPanel === menu);
	if (!nextPanel) return;
	nextPanel.hidden = false;

	if (wasClosed || previousMenu === null) {
		for (const panel of panels) {
			if (panel !== nextPanel) panel.hidden = true;
			delete panel.dataset.motion;
		}
		delete nextPanel.dataset.motion;
	} else {
		const previousPanel = panels.find(
			(panel) => panel.dataset.navPanel === previousMenu,
		);
		const movingForward =
			(menuOrder.get(menu) ?? 0) > (menuOrder.get(previousMenu) ?? 0);
		if (previousPanel) {
			previousPanel.hidden = false;
			previousPanel.dataset.motion = movingForward ? "to-start" : "to-end";
		}
		nextPanel.dataset.motion = movingForward ? "from-end" : "from-start";
	}

	cleanupTimer = window.setTimeout(
		() => finishPanelMotion(id, menu),
		CONTENT_DURATION,
	);
};

const closeMenu = () => {
	cancelOpen();
	cancelClose();
	if (!popover || !popoverPosition || activeMenu === null) return;
	if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);

	activeMenu = null;
	updateOpenDelay(null);
	setTriggerState(null);
	popover.dataset.state = "closed";
	const id = ++transitionId;
	cleanupTimer = window.setTimeout(() => {
		if (id !== transitionId || activeMenu !== null) return;
		popoverPosition.hidden = true;
		finishPanelMotion(id, null);
	}, CONTENT_DURATION);
};

const scheduleClose = () => {
	cancelOpen();
	cancelClose();
	closeTimer = window.setTimeout(closeMenu, CLOSE_DELAY);
};

const enterTrigger = (menu: string) => {
	cancelOpen();
	if (!isOpenDelayed) {
		openMenu(menu);
		return;
	}
	if (activeMenu === menu) {
		cancelClose();
		return;
	}
	openTimer = window.setTimeout(() => {
		cancelClose();
		openMenu(menu);
	}, OPEN_DELAY);
};

for (const trigger of triggers) {
	trigger.addEventListener("pointerenter", () => {
		const state = triggerState.get(trigger);
		if (!state) return;
		state.wasClickClose = false;
		state.wasEscapeClose = false;
	});
	trigger.addEventListener("pointermove", (event) => {
		const target = trigger.dataset.navTrigger;
		const state = triggerState.get(trigger);
		if (
			event.pointerType !== "mouse" ||
			!target ||
			!state ||
			state.wasClickClose ||
			state.wasEscapeClose ||
			state.hasPointerMoveOpened
		) {
			return;
		}
		enterTrigger(target);
		state.hasPointerMoveOpened = true;
	});
	trigger.addEventListener("pointerleave", (event) => {
		if (event.pointerType !== "mouse") return;
		scheduleClose();
		const state = triggerState.get(trigger);
		if (state) state.hasPointerMoveOpened = false;
	});
	trigger.addEventListener("click", () => {
		const target = trigger.dataset.navTrigger;
		if (!target) return;
		openMenu(target);
		const state = triggerState.get(trigger);
		if (state) state.wasClickClose = false;
	});
	trigger.addEventListener("keydown", (event) => {
		if (
			event.key === "ArrowDown" &&
			activeMenu === trigger.dataset.navTrigger
		) {
			event.preventDefault();
			panels
				.find((panel) => panel.dataset.navPanel === activeMenu)
				?.querySelector<HTMLAnchorElement>("a")
				?.focus();
			return;
		}
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const currentIndex = triggers.indexOf(trigger);
		const offset = event.key === "ArrowRight" || event.key === "Home" ? 1 : -1;
		const nextTrigger = triggers.at(
			event.key === "Home"
				? 0
				: event.key === "End"
					? -1
					: (currentIndex + offset + triggers.length) % triggers.length,
		);
		nextTrigger?.focus();
	});
}

popoverPosition?.addEventListener("pointerenter", cancelClose);
popoverPosition?.addEventListener("pointerleave", scheduleClose);

const mobileTrigger = document.querySelector<HTMLButtonElement>(
	"[data-mobile-nav-trigger]",
);
const mobileNav = document.querySelector<HTMLElement>("[data-mobile-nav]");

const setMobile = (open: boolean) => {
	if (!mobileTrigger || !mobileNav) return;
	mobileTrigger.setAttribute("aria-expanded", String(open));
	mobileTrigger.setAttribute(
		"aria-label",
		open ? "Close navigation" : "Open navigation",
	);
	mobileTrigger.dataset.state = open ? "open" : "closed";
	mobileNav.dataset.state = open ? "open" : "closed";
	mobileNav.hidden = !open;
	document.body.style.overflow = open ? "hidden" : "";
};

mobileTrigger?.addEventListener("click", () => {
	const opening = mobileTrigger.dataset.state !== "open";
	closeMenu();
	setMobile(opening);
});

document.addEventListener("pointerdown", (event) => {
	if (!(event.target instanceof Node)) return;
	if (activeMenu && !header?.contains(event.target)) closeMenu();
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	const openTrigger = triggers.find(
		(trigger) => trigger.dataset.navTrigger === activeMenu,
	);
	const state = openTrigger ? triggerState.get(openTrigger) : undefined;
	if (state) state.wasEscapeClose = true;
	closeMenu();
	setMobile(false);
	if (popover?.contains(document.activeElement)) openTrigger?.focus();
});

popover?.addEventListener("click", (event) => {
	if (event.target instanceof Element && event.target.closest("a")) closeMenu();
});

mobileNav?.addEventListener("click", (event) => {
	if (event.target instanceof HTMLAnchorElement) setMobile(false);
});

const desktopQuery = window.matchMedia("(min-width: 769px)");
desktopQuery.addEventListener("change", ({ matches }) => {
	if (matches) setMobile(false);
	else closeMenu();
});
