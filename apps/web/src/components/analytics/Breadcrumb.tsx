import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { useUserMap } from "@/hooks/useUserMap";
import { formatUsername } from "@/lib/format";

const segmentLabels: Record<string, string> = {
	dashboard: "Overview",
	developers: "Developers",
	projects: "Projects",
	roi: "ROI Calculator",
	sessions: "Sessions",
	learnings: "Learnings",
	errors: "Errors",
	invitations: "Invitations",
	profile: "Profile",
};

export function Breadcrumb() {
	const { pathname } = useLocation();
	const segments = pathname.split("/").filter(Boolean);
	const { trackNavigation } = useAnalyticsTracking();

	const { userMap } = useUserMap();

	const crumbs = segments.map((segment, index) => {
		const href = `/${segments.slice(0, index + 1).join("/")}`;
		const prevSegment = index > 0 ? segments[index - 1] : null;
		const isDeveloperUserId = prevSegment === "developers";
		const label = isDeveloperUserId
			? formatUsername(segment, userMap)
			: segmentLabels[segment] || decodeURIComponent(segment);
		const isLast = index === segments.length - 1;

		return { href, label, isLast };
	});

	return (
		<nav className="flex shrink-0 items-center gap-1 text-xs text-muted h-10 px-8 bg-surface border-b border-border">
			{crumbs.map((crumb, index) => (
				<span key={crumb.href} className="flex items-center gap-1">
					{index > 0 && <ChevronRight className="h-3 w-3" />}
					{crumb.isLast ? (
						<span className="text-subheading">{crumb.label}</span>
					) : (
						<Link
							to={crumb.href}
							onClick={() => {
								trackNavigation({
									navType: "breadcrumb",
									sourceComponent: "breadcrumb",
									targetPath: crumb.href,
									targetType: "page",
								});
							}}
							className="hover:text-foreground transition-colors"
						>
							{crumb.label}
						</Link>
					)}
				</span>
			))}
		</nav>
	);
}
