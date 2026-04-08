import { MonitorCogIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";

export function ProfileAppearanceCard() {
	const { setTheme, theme } = useTheme();
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const selectedTheme = isMounted ? (theme ?? "system") : "system";

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>
					Choose how the app looks in this browser.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{isMounted ? (
					<ToggleGroup
						className="w-full"
						onValueChange={(nextValue) => {
							const nextTheme = nextValue[0];
							if (nextTheme) {
								setTheme(nextTheme);
							}
						}}
						size="sm"
						value={[selectedTheme]}
						variant="outline"
					>
						<ToggleGroupItem className="flex-1" value="light">
							<SunIcon data-icon="inline-start" />
							Light
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1" value="dark">
							<MoonIcon data-icon="inline-start" />
							Dark
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1" value="system">
							<MonitorCogIcon data-icon="inline-start" />
							System
						</ToggleGroupItem>
					</ToggleGroup>
				) : (
					<Skeleton className="h-9 w-full rounded-md" />
				)}
			</CardContent>
		</Card>
	);
}
