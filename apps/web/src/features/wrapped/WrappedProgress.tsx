import { cn } from "@/lib/utils";

export interface WrappedProgressItem {
	ariaLabel?: string;
	id: string;
	isActive: boolean;
	onSelect?: () => void;
}

interface WrappedProgressProps {
	ariaLabel: string;
	disabled?: boolean;
	items: readonly WrappedProgressItem[];
}

export function WrappedProgress(props: WrappedProgressProps) {
	const { ariaLabel, disabled = false, items } = props;

	return (
		<nav className="mymind-wrapped-progress" aria-label={ariaLabel}>
			{items.map((item) => {
				const isInteractive = !disabled && typeof item.onSelect === "function";

				return (
					<button
						key={item.id}
						type="button"
						aria-current={item.isActive ? "step" : undefined}
						aria-label={item.ariaLabel ?? item.id}
						disabled={!isInteractive}
						className={cn(
							"mymind-wrapped-progress__button",
							item.isActive
								? "mymind-wrapped-progress__button--active"
								: "mymind-wrapped-progress__button--inactive",
						)}
						onClick={item.onSelect}
					>
						<span
							aria-hidden="true"
							className={cn(
								"mymind-wrapped-progress__segment",
								item.isActive
									? "mymind-wrapped-progress__segment--active"
									: "mymind-wrapped-progress__segment--inactive",
							)}
						/>
					</button>
				);
			})}
		</nav>
	);
}
