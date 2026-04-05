import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";

export function WorkspaceSummaryStrip({
	tiles,
	isPending,
	isError,
}: {
	tiles: Array<{
		id: string;
		label: string;
		displayValue: string;
	}>;
	isPending: boolean;
	isError: boolean;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
			{tiles.map((tile) => (
				<Card
					key={tile.id}
					size="sm"
					className="bg-card/95 shadow-none ring-1 ring-border/60"
				>
					<CardContent className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">{tile.label}</span>
						{isPending ? (
							<Skeleton className="h-6 w-24 rounded-md" />
						) : (
							<span className="truncate text-lg font-semibold">
								{isError ? "—" : tile.displayValue}
							</span>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
