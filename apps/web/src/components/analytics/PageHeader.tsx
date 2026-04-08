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
		<div className="mb-10">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<h1 className="text-3xl font-bold text-heading">{title}</h1>
						{titleSuffix}
					</div>
					{description && <p className="text-muted">{description}</p>}
				</div>
				{actions && <div className="flex items-center gap-4">{actions}</div>}
			</div>
		</div>
	);
}
