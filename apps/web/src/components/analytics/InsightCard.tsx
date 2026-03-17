import {
	AlertTriangle,
	Award,
	ChevronRight,
	Info,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { captureInsightCardClicked } from "../../lib/product-analytics";
import { cn } from "../../lib/utils";

export interface Insight {
	insight_key: string;
	type: "trend" | "performer" | "alert" | "info";
	severity: "positive" | "warning" | "negative" | "info";
	message: string;
	link: string;
}

interface InsightCardProps {
	insight: Insight;
	tracking: {
		organizationId: string;
		userId: string;
		positionIndex: number;
		dateRangeDays: number;
	};
}

const SEVERITY_CONFIG = {
	positive: {
		bgColor: "bg-status-success-bg",
		borderColor: "border-status-success-border",
		textColor: "text-status-success-text",
		iconColor: "text-status-success-icon",
		icon: TrendingUp,
	},
	warning: {
		bgColor: "bg-status-warning-bg",
		borderColor: "border-status-warning-border",
		textColor: "text-status-warning-text",
		iconColor: "text-status-warning-icon",
		icon: AlertTriangle,
	},
	negative: {
		bgColor: "bg-status-error-bg",
		borderColor: "border-status-error-border",
		textColor: "text-status-error-text",
		iconColor: "text-status-error-icon",
		icon: TrendingDown,
	},
	info: {
		bgColor: "bg-status-info-bg",
		borderColor: "border-status-info-border",
		textColor: "text-status-info-text",
		iconColor: "text-status-info-icon",
		icon: Info,
	},
};

const TYPE_ICON = {
	trend: TrendingUp,
	performer: Award,
	alert: AlertTriangle,
	info: Info,
};

export function InsightCard({ insight, tracking }: InsightCardProps) {
	const config = SEVERITY_CONFIG[insight.severity];
	const TypeIcon = TYPE_ICON[insight.type];

	return (
		<Link
			to={insight.link}
			onClick={() => {
				captureInsightCardClicked({
					organization_id: tracking.organizationId,
					user_id: tracking.userId,
					page_name: "overview",
					insight_key: insight.insight_key,
					insight_type: insight.type,
					insight_severity: insight.severity,
					destination_path: insight.link,
					position_index: tracking.positionIndex,
					date_range_days: tracking.dateRangeDays,
				});
			}}
			className={cn(
				"block p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer hover:scale-[1.02]",
				config.bgColor,
				config.borderColor,
			)}
		>
			<div className="flex items-start gap-3">
				<div className={cn("flex-shrink-0", config.iconColor)}>
					<TypeIcon size={24} />
				</div>

				<div className="flex-1">
					<p className={cn("text-sm font-medium", config.textColor)}>
						{insight.message}
					</p>
				</div>

				<div className={cn("flex-shrink-0", config.iconColor)}>
					<ChevronRight size={20} />
				</div>
			</div>
		</Link>
	);
}
