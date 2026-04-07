import type { ReactNode } from "react";

export function SettingsSectionIntro({
	action,
	description,
	title,
}: {
	action?: ReactNode;
	description: string;
	title: string;
}) {
	return (
		<div className="mb-4 flex flex-col gap-4 border-b border-border/60 py-5 sm:flex-row sm:items-end sm:justify-between">
			<div className="flex max-w-[64ch] flex-col gap-1">
				<h1 className="font-heading text-2xl font-medium tracking-tight text-balance text-foreground">
					{title}
				</h1>
				<p className="text-base text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}
