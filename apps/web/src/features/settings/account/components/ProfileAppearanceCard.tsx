"use client";

import { MonitorCogIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";

export function ProfileAppearanceCard() {
	const { theme, setTheme } = useTheme();
	const selectedTheme = theme ?? "light";

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>Choose how the app looks in this browser.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<ToggleGroup
					value={[selectedTheme]}
					onValueChange={(nextValue) => {
						const nextTheme = nextValue[0];
						if (nextTheme) {
							setTheme(nextTheme);
						}
					}}
					variant="outline"
					size="sm"
					className="w-full"
				>
					<ToggleGroupItem value="light" className="flex-1">
						<SunIcon data-icon="inline-start" />
						Light
					</ToggleGroupItem>
					<ToggleGroupItem value="dark" className="flex-1">
						<MoonIcon data-icon="inline-start" />
						Dark
					</ToggleGroupItem>
					<ToggleGroupItem value="system" className="flex-1">
						<MonitorCogIcon data-icon="inline-start" />
						System
					</ToggleGroupItem>
				</ToggleGroup>
			</CardContent>
		</Card>
	);
}
