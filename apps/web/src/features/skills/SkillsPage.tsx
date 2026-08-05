import { useState } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { HistoricalSkillDetailSheet } from "@/features/skills/components/HistoricalSkillDetailSheet";
import { SkillsPageView } from "@/features/skills/components/SkillsPageView";
import { orpc } from "@/lib/orpc";

export function SkillsPage() {
	const [selectedSkillName, setSelectedSkillName] = useState<string | null>(
		null,
	);
	const skillsQuery = useAnalyticsQuery(
		orpc.analytics.skills.list.queryOptions({}),
	);

	return (
		<>
			<SkillsPageView
				skills={skillsQuery.data}
				isError={skillsQuery.isError}
				isPending={skillsQuery.isPending}
				onRetry={() => {
					void skillsQuery.refetch();
				}}
				onSelectSkill={setSelectedSkillName}
			/>
			<HistoricalSkillDetailSheet
				skillName={selectedSkillName}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedSkillName(null);
					}
				}}
			/>
		</>
	);
}
