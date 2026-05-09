import type * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"inline-flex min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-current/15 bg-current/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-current",
				className,
			)}
			{...props}
		/>
	);
}

export { Kbd };
