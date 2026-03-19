import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const { trackUtility } = useAnalyticsTracking();

	useEffect(() => setMounted(true), []);

	if (!mounted) {
		return <div className="h-8 w-8" />;
	}

	return (
		<button
			type="button"
			onClick={() => {
				trackUtility({
					utilityName: "theme_toggle",
					componentId: "theme_toggle",
					utilityState: resolvedTheme === "dark" ? "light" : "dark",
				});
				setTheme(resolvedTheme === "dark" ? "light" : "dark");
			}}
			className="rounded-lg p-2 text-muted hover:bg-hover hover:text-foreground transition-colors"
			aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
		>
			{resolvedTheme === "dark" ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</button>
	);
}
