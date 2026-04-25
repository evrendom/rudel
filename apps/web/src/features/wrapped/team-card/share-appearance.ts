import type { WrappedShareAppearance } from "@rudel/api-routes";

export const DEFAULT_WRAPPED_SHARE_APPEARANCE: WrappedShareAppearance = {
	layoutMode: "front",
	showArchetypeLabel: true,
};

export function resolveWrappedShareAppearance(
	appearance?: WrappedShareAppearance | null,
): WrappedShareAppearance {
	return {
		layoutMode:
			appearance?.layoutMode ?? DEFAULT_WRAPPED_SHARE_APPEARANCE.layoutMode,
		showArchetypeLabel:
			appearance?.showArchetypeLabel ??
			DEFAULT_WRAPPED_SHARE_APPEARANCE.showArchetypeLabel,
	};
}
