import type { CSSProperties } from "react";
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
	rewardCardBackground?: string;
}

export function WrappedProgress(props: WrappedProgressProps) {
	const { ariaLabel, disabled = false, items, rewardCardBackground } = props;

	return (
		<nav className="mymind-wrapped-progress" aria-label={ariaLabel}>
			{items.map((item) => {
				const isInteractive = !disabled && typeof item.onSelect === "function";
				const isRewardCard = item.id === "card";
				const rewardCardStyle =
					isRewardCard && item.isActive && rewardCardBackground
						? ({
								"--wrapped-progress-reward-card-background":
									rewardCardBackground,
							} as CSSProperties)
						: undefined;

				return (
					<button
						key={item.id}
						type="button"
						aria-current={item.isActive ? "step" : undefined}
						aria-label={item.ariaLabel ?? item.id}
						disabled={!isInteractive}
						className={cn(
							"mymind-wrapped-progress__button",
							isRewardCard
								? "mymind-wrapped-progress__button--reward"
								: null,
							item.isActive
								? "mymind-wrapped-progress__button--active"
								: "mymind-wrapped-progress__button--inactive",
						)}
						onClick={item.onSelect}
					>
						{isRewardCard ? (
							<span
								aria-hidden="true"
								style={rewardCardStyle}
								className={cn(
									"mymind-wrapped-progress__reward-card",
									item.isActive
										? "mymind-wrapped-progress__reward-card--active"
										: "mymind-wrapped-progress__reward-card--inactive",
								)}
							/>
						) : (
							<span
								aria-hidden="true"
								className={cn(
									"mymind-wrapped-progress__segment",
									item.isActive
										? "mymind-wrapped-progress__segment--active"
										: "mymind-wrapped-progress__segment--inactive",
								)}
							/>
						)}
					</button>
				);
			})}
		</nav>
	);
}
