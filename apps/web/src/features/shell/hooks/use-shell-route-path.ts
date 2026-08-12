import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
	getBottomRailPreviewPath,
	getLeftSidebarAdalinePreviewPath,
	getLeftSidebarPreviewPath,
	getLeftSidebarTablePreviewPath,
	getLeftSidebarThreadCollapsiblePreviewPath,
	getLeftSidebarThreadPreviewPath,
	getLeftSidebarThreadV2PreviewPath,
	getLeftSidebarThreadWaterfallPreviewPath,
	getLeftSidebarTurnsPreviewPath,
	isBottomRailPreviewPath,
	isLeftSidebarAdalinePreviewPath,
	isLeftSidebarPreviewPath,
	isLeftSidebarTablePreviewPath,
	isLeftSidebarThreadCollapsiblePreviewPath,
	isLeftSidebarThreadPreviewPath,
	isLeftSidebarThreadV2PreviewPath,
	isLeftSidebarThreadWaterfallPreviewPath,
	isLeftSidebarTurnsPreviewPath,
} from "@/app/routes";

export function useShellRoutePath() {
	const location = useLocation();
	const isBottomRailPreview = isBottomRailPreviewPath(location.pathname);
	const isLeftSidebarPreview = isLeftSidebarPreviewPath(location.pathname);
	const isLeftSidebarAdalinePreview = isLeftSidebarAdalinePreviewPath(
		location.pathname,
	);
	const isLeftSidebarTablePreview = isLeftSidebarTablePreviewPath(
		location.pathname,
	);
	const isLeftSidebarThreadPreview = isLeftSidebarThreadPreviewPath(
		location.pathname,
	);
	const isLeftSidebarThreadCollapsiblePreview =
		isLeftSidebarThreadCollapsiblePreviewPath(location.pathname);
	const isLeftSidebarThreadWaterfallPreview =
		isLeftSidebarThreadWaterfallPreviewPath(location.pathname);
	const isLeftSidebarThreadV2Preview = isLeftSidebarThreadV2PreviewPath(
		location.pathname,
	);
	const isLeftSidebarTurnsPreview = isLeftSidebarTurnsPreviewPath(
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

			if (isLeftSidebarAdalinePreview) {
				return getLeftSidebarAdalinePreviewPath(canonicalPath);
			}

			if (isLeftSidebarTurnsPreview) {
				return getLeftSidebarTurnsPreviewPath(canonicalPath);
			}

			if (isLeftSidebarTablePreview) {
				return getLeftSidebarTablePreviewPath(canonicalPath);
			}

			if (isLeftSidebarThreadPreview) {
				return getLeftSidebarThreadPreviewPath(canonicalPath);
			}

			if (isLeftSidebarThreadCollapsiblePreview) {
				return getLeftSidebarThreadCollapsiblePreviewPath(canonicalPath);
			}

			if (isLeftSidebarThreadWaterfallPreview) {
				return getLeftSidebarThreadWaterfallPreviewPath(canonicalPath);
			}

			if (isLeftSidebarThreadV2Preview) {
				return getLeftSidebarThreadV2PreviewPath(canonicalPath);
			}

			return canonicalPath;
		},
		[
			isBottomRailPreview,
			isLeftSidebarAdalinePreview,
			isLeftSidebarPreview,
			isLeftSidebarTablePreview,
			isLeftSidebarThreadCollapsiblePreview,
			isLeftSidebarThreadPreview,
			isLeftSidebarThreadWaterfallPreview,
			isLeftSidebarThreadV2Preview,
			isLeftSidebarTurnsPreview,
		],
	);
}
