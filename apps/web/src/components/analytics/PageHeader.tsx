import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	titleSuffix?: ReactNode;
	description?: string;
	actions?: ReactNode;
}

export function PageHeader({
	title,
	titleSuffix,
	description,
	actions,
}: PageHeaderProps) {
	return (
		<div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div className="min-w-0">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					<h1 className="font-heading text-3xl font-medium tracking-tight text-heading">
						{title}
					</h1>
					{titleSuffix}
				</div>
				{description ? (
					<p className="max-w-2xl text-sm text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-3 md:justify-end">
					{actions}
				</div>
			) : null}
		</div>
	);
}
