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
	organization: "Organization",
	admin: "Admin",
	new: "Create organization",
};

export function SiteHeader() {
	const { pathname } = useLocation();
	const { trackNavigation } = useAnalyticsTracking();
	const { userMap } = useUserMap();
	const segments = pathname.split("/").filter(Boolean);

	const crumbs = segments.map((segment, index) => {
		const href = `/${segments.slice(0, index + 1).join("/")}`;
		const previousSegment = index > 0 ? segments[index - 1] : null;
		const isDeveloperSegment = previousSegment === "developers";
		const label = isDeveloperSegment
			? formatUsername(segment, userMap)
			: (segmentLabels[segment] ?? decodeURIComponent(segment));

		return {
			href,
			label,
			isLast: index === segments.length - 1,
		};
	});

	return (
		<nav className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-8 text-xs text-muted">
			{crumbs.map((crumb, index) => (
				<span key={crumb.href} className="flex items-center gap-1">
					{index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
					{crumb.isLast ? (
						<span className="text-subheading">{crumb.label}</span>
					) : (
						<Link
							to={crumb.href}
							onClick={() => {
								trackNavigation({
									navType: "breadcrumb",
									sourceComponent: "site_header",
									targetPath: crumb.href,
									targetType: "page",
								});
							}}
							className="transition-colors hover:text-foreground"
						>
							{crumb.label}
						</Link>
					)}
				</span>
			))}
		</nav>
	);
}
