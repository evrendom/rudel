import type { ComponentType } from "react";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import { getModelBadgeTone } from "@/features/dashboard/components/dashboard-model-brand";

export function getModelIconComponent(
	model: string | undefined,
): ComponentType<{ className?: string }> | null {
	if (!model) {
		return null;
	}

	const { icon } = getModelBadgeTone(model);
	if (icon === "claude") {
		return ClaudeModelIcon;
	}
	if (icon === "codex") {
		return CodexModelIcon;
	}
	return null;
}
