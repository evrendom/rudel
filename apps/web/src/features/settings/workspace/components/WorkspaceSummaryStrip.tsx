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
		<div className="overflow-hidden rounded-4xl border border-border/60 bg-card/95">
			<div className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
				{tiles.map((tile) => (
					<div key={tile.id} className="flex flex-col gap-1 px-4 py-4">
						<p className="text-sm text-muted-foreground">{tile.label}</p>
						{isPending ? (
							<Skeleton className="h-6 w-24 rounded-md" />
						) : (
							<p className="truncate text-lg font-semibold tabular-nums">
								{isError ? "—" : tile.displayValue}
							</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
