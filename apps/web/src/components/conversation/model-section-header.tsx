import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { conversationTraceLabelClassName } from "./conversation-trace-class-names";
import { ModelTraceIcon } from "./conversation-trace-icons";
import { ConversationTracePlanTag } from "./conversation-trace-plan-tag";

export type ModelSectionHeaderData = {
	agentLabel: string;
	agentModel: string | undefined;
	modelSetting?: string;
	continues: boolean;
	planMode: boolean;
	terminal: boolean;
};

const MODEL_SETTING_LABELS: Readonly<Record<string, string>> = {
	high: "High",
	low: "Low",
	medium: "Medium",
	minimal: "Minimal",
	none: "None",
	ultracode: "Ultracode",
	xhigh: "Extra High",
};

export function formatConversationModelSetting(value: string | undefined) {
	const modelSetting = value?.trim();
	if (!modelSetting) {
		return undefined;
	}
	return MODEL_SETTING_LABELS[modelSetting.toLowerCase()] ?? modelSetting;
}

export function ModelSectionHeader({
	collapsedContent,
	data,
	expanded,
	expandable = true,
}: {
	collapsedContent?: ReactNode;
	data: ModelSectionHeaderData;
	expanded: boolean;
	expandable?: boolean;
}) {
	const modelSettingLabel = formatConversationModelSetting(data.modelSetting);
	return (
		<span className="contents" data-model-section-header>
			<span className="session-turn-table-model-icon-shell relative flex size-5 shrink-0">
				<ModelTraceIcon
					className="session-turn-table-model-icon size-5"
					expanded={expanded}
					expandable={expandable}
					model={data.agentModel}
				/>
			</span>
			<div className="flex min-w-0 items-center gap-1.5">
				<p
					className={cn(
						conversationTraceLabelClassName,
						"min-w-0 shrink truncate",
					)}
					data-trace-model-label
				>
					{data.agentLabel}
				</p>
				{modelSettingLabel ? (
					<p
						className={cn(conversationTraceLabelClassName, "opacity-60")}
						data-trace-model-setting
						title={`Model setting: ${modelSettingLabel}`}
					>
						{modelSettingLabel}
					</p>
				) : null}
			</div>
			{data.planMode ? <ConversationTracePlanTag /> : null}
			{expanded ? null : collapsedContent}
		</span>
	);
}
