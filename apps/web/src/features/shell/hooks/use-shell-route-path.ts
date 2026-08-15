import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
	getBottomRailPreviewPath,
	getLeftSidebarPreviewPath,
	getLeftSidebarThreadPreviewPath,
	isBottomRailPreviewPath,
	isLeftSidebarPreviewPath,
	isLeftSidebarThreadPreviewPath,
} from "@/app/routes";

export function useShellRoutePath() {
	const location = useLocation();
	const isBottomRailPreview = isBottomRailPreviewPath(location.pathname);
	const isLeftSidebarPreview = isLeftSidebarPreviewPath(location.pathname);
	const isLeftSidebarThreadPreview = isLeftSidebarThreadPreviewPath(
		location.pathname,
	);

	return useCallback(
		(canonicalPath: string) => {
			if (isBottomRailPreview) {
				return getBottomRailPreviewPath(canonicalPath);
			}

			if (isLeftSidebarPreview) {
				return getLeftSidebarPreviewPath(canonicalPath);
			}

			if (isLeftSidebarThreadPreview) {
				return getLeftSidebarThreadPreviewPath(canonicalPath);
			}

			return canonicalPath;
		},
		[isBottomRailPreview, isLeftSidebarPreview, isLeftSidebarThreadPreview],
	);
}
