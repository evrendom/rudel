import { type RefObject, useEffect } from "react";

export function useSidebarNewsActiveAttribute({
	isActive,
	attributeName,
	triggerRef,
}: {
	isActive: boolean;
	attributeName: string;
	triggerRef: RefObject<HTMLElement | null>;
}) {
	useEffect(() => {
		const trigger = triggerRef.current;
		if (!trigger) {
			return;
		}

		const sidebarContainer = trigger.closest(".dashboard-01-chrome-sidebar");
		const previewContainer = trigger.closest(".dashboard-01-preview");
		if (!(sidebarContainer instanceof HTMLElement)) {
			return;
		}

		if (isActive) {
			sidebarContainer.setAttribute(attributeName, "true");
			if (previewContainer instanceof HTMLElement) {
				previewContainer.setAttribute(attributeName, "true");
			}
		} else {
			sidebarContainer.removeAttribute(attributeName);
			if (previewContainer instanceof HTMLElement) {
				previewContainer.removeAttribute(attributeName);
			}
		}

		return () => {
			sidebarContainer.removeAttribute(attributeName);
			if (previewContainer instanceof HTMLElement) {
				previewContainer.removeAttribute(attributeName);
			}
		};
	}, [attributeName, isActive, triggerRef]);
}
