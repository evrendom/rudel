import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { conversationTraceLabelClassName } from "./conversation-trace-class-names";
import { ModelTraceIcon } from "./conversation-trace-icons";
import { ConversationTracePlanTag } from "./conversation-trace-plan-tag";

export type ModelSectionHeaderData = {
	agentLabel: string;
	agentModel: string | undefined;
	continues: boolean;
	planMode: boolean;
	terminal: boolean;
};

export function ModelSectionHeader({
	collapsedContent,
	data,
	expanded,
}: {
	collapsedContent?: ReactNode;
	data: ModelSectionHeaderData;
	expanded: boolean;
}) {
	return (
		<span className="contents" data-model-section-header>
			<ModelTraceIcon expanded={expanded} model={data.agentModel} />
			<p
				className={cn(conversationTraceLabelClassName, "min-w-0 truncate")}
				data-trace-model-label
			>
				{data.agentLabel}
			</p>
			{data.planMode ? <ConversationTracePlanTag /> : null}
			{expanded ? null : collapsedContent}
		</span>
	);
}
