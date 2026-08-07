const tabs = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-scene-tab]"),
);
const panels = Array.from(
	document.querySelectorAll<HTMLElement>("[data-scene-panel]"),
);

const select = (id: string, focus = false) => {
	const nextPanel = panels.find((panel) => panel.dataset.scenePanel === id);
	const nextTab = tabs.find((tab) => tab.dataset.sceneTab === id);
	if (!nextPanel || !nextTab) return;

	// Reveal the incoming scene before retiring the outgoing scene. The outer
	// dashboard never unmounts and there is no frame with an empty panel.
	nextPanel.hidden = false;
	for (const panel of panels) {
		if (panel !== nextPanel) panel.hidden = true;
	}
	for (const tab of tabs) {
		const selected = tab === nextTab;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
	}
	if (focus) nextTab.focus();
};

for (const tab of tabs) {
	tab.addEventListener("click", () => select(tab.dataset.sceneTab ?? ""));
	tab.addEventListener("keydown", (event) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const index = tabs.indexOf(tab);
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? tabs.length - 1
					: (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
						tabs.length;
		select(tabs[nextIndex].dataset.sceneTab ?? "", true);
	});
}
