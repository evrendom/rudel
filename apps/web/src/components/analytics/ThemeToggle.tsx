import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const { trackUtility } = useAnalyticsTracking();
	const nextTheme =
		resolvedTheme === "dark"
			? "light"
			: resolvedTheme === "light"
				? "dark"
				: null;

	if (nextTheme === null) {
		return <div className="h-8 w-8" />;
	}

	return (
		<button
			type="button"
			onClick={() => {
				trackUtility({
					utilityName: "theme_toggle",
					componentId: "theme_toggle",
					utilityState: nextTheme,
				});
				setTheme(nextTheme);
			}}
			className="rounded-lg p-2 text-muted hover:bg-hover hover:text-foreground transition-colors"
			aria-label={`Switch to ${nextTheme} mode`}
		>
			{resolvedTheme === "dark" ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</button>
	);
}
