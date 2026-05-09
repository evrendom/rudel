import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const spinnerVariants = cva(
	"inline-block animate-spin rounded-full border-4 border-solid border-accent border-r-transparent",
	{
		variants: {
			size: {
				sm: "h-6 w-6",
				default: "h-8 w-8",
				lg: "h-10 w-10",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

function Spinner({
	className,
	size,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof spinnerVariants>) {
	return (
		<div
			data-slot="spinner"
			className={cn(spinnerVariants({ size, className }))}
			{...props}
		/>
	);
}

export { Spinner, spinnerVariants };
