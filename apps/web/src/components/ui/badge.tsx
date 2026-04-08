import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex h-5 items-center gap-1 rounded-3xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				secondary: "bg-secondary text-secondary-foreground",
				destructive:
					"bg-destructive/10 text-destructive dark:bg-destructive/20",
				outline: "text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
