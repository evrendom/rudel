import {
	AiBrain01Icon,
	AlertCircleIcon,
	Clock01Icon,
	DollarCircleIcon,
	FolderGitIcon,
	HierarchySquare01Icon,
	SparklesIcon,
	TokenCircleIcon,
	User02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type {
	SessionOverviewFilterKey,
	SessionOverviewRangeFilterKey,
} from "@/features/sessions/components/sessions-overview-table-utils";

export type SessionOverviewToolbarFilter =
	| {
			group: "identity" | "usage" | "activity";
			icon: IconSvgElement;
			kind: "options";
			key: SessionOverviewFilterKey;
			label: string;
	  }
	| {
			group: "identity" | "usage" | "activity";
			icon: IconSvgElement;
			kind: "range";
			key: SessionOverviewRangeFilterKey;
			label: string;
	  }
	| {
			group: "identity" | "usage" | "activity";
			icon: IconSvgElement;
			kind: "token-ranges";
			key: "tokens";
			label: string;
	  };

export const SESSION_OVERVIEW_TOOLBAR_FILTERS = [
	{
		group: "identity",
		icon: FolderGitIcon,
		key: "repository",
		kind: "options",
		label: "Repository",
	},
	{
		group: "identity",
		icon: User02Icon,
		key: "user",
		kind: "options",
		label: "Member",
	},
	{
		group: "identity",
		icon: AiBrain01Icon,
		key: "model",
		kind: "options",
		label: "Model",
	},
	{
		group: "usage",
		icon: Clock01Icon,
		key: "duration",
		kind: "range",
		label: "Length",
	},
	{
		group: "usage",
		icon: TokenCircleIcon,
		key: "tokens",
		kind: "token-ranges",
		label: "Tokens",
	},
	{
		group: "usage",
		icon: DollarCircleIcon,
		key: "cost",
		kind: "range",
		label: "Cost",
	},
	{
		group: "activity",
		icon: AlertCircleIcon,
		key: "errors",
		kind: "range",
		label: "Errors",
	},
	{
		group: "activity",
		icon: SparklesIcon,
		key: "skills",
		kind: "options",
		label: "Skills",
	},
	{
		group: "activity",
		icon: HierarchySquare01Icon,
		key: "subagents",
		kind: "range",
		label: "Subagent types",
	},
] satisfies readonly SessionOverviewToolbarFilter[];
