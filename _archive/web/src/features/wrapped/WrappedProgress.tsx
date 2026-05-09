import { useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	// biome-ignore lint/style/noRestrictedImports: progress marker animation bridges active-step changes after React commits them.
	useEffect,
	useState,
} from "react";
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

let wrappedPreviousProgressActiveId: string | null = null;

export function WrappedProgress(props: WrappedProgressProps) {
	const { ariaLabel, disabled = false, items, rewardCardBackground } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const currentActiveId = getWrappedProgressActiveId(items);
	const [visibleActiveId, setVisibleActiveId] = useState<string | null>(() =>
		resolveWrappedInitialProgressActiveId(items, currentActiveId),
	);

	useEffect(() => {
		const nextVisibleActiveId = resolveWrappedInitialProgressActiveId(
			items,
			currentActiveId,
		);

		if (reduceMotion || nextVisibleActiveId === currentActiveId) {
			setVisibleActiveId(currentActiveId);
			wrappedPreviousProgressActiveId = currentActiveId;
			return;
		}

		setVisibleActiveId(nextVisibleActiveId);

		const frameId = window.requestAnimationFrame(() => {
			setVisibleActiveId(currentActiveId);
			wrappedPreviousProgressActiveId = currentActiveId;
		});

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, [currentActiveId, items, reduceMotion]);

	return (
		<nav className="mymind-wrapped-progress" aria-label={ariaLabel}>
			{items.map((item) => {
				const isInteractive = !disabled && typeof item.onSelect === "function";
				const isRewardCard = item.id === "card";
				const isVisuallyActive = item.id === visibleActiveId;
				const rewardCardStyle =
					isRewardCard && rewardCardBackground
						? ({
								"--wrapped-progress-reward-card-background":
									rewardCardBackground,
							} as CSSProperties)
						: undefined;

				return (
					<button
						key={item.id}
						type="button"
						aria-current={isVisuallyActive ? "step" : undefined}
						aria-label={item.ariaLabel ?? item.id}
						disabled={!isInteractive}
						style={{
							flexGrow: isRewardCard
								? isVisuallyActive
									? 0.98
									: 0.8
								: isVisuallyActive
									? 1.85
									: 0.78,
						}}
						className={cn(
							"mymind-wrapped-progress__button",
							isRewardCard ? "mymind-wrapped-progress__button--reward" : null,
							isVisuallyActive
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
									isVisuallyActive
										? "mymind-wrapped-progress__reward-card--active"
										: "mymind-wrapped-progress__reward-card--inactive",
									reduceMotion
										? "mymind-wrapped-progress__reward-card--reduced-motion"
										: null,
								)}
							>
								<span
									aria-hidden="true"
									className="mymind-wrapped-progress__reward-card-surface mymind-wrapped-progress__reward-card-surface--dark"
								/>
								<span
									aria-hidden="true"
									className={cn(
										"mymind-wrapped-progress__reward-card-surface",
										"mymind-wrapped-progress__reward-card-surface--active",
										isVisuallyActive
											? "mymind-wrapped-progress__reward-card-surface--visible"
											: "mymind-wrapped-progress__reward-card-surface--hidden",
									)}
								/>
							</span>
						) : (
							<span
								aria-hidden="true"
								className={cn(
									"mymind-wrapped-progress__segment",
									isVisuallyActive
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

function getWrappedProgressActiveId(items: readonly WrappedProgressItem[]) {
	return items.find((item) => item.isActive)?.id ?? null;
}

function resolveWrappedInitialProgressActiveId(
	items: readonly WrappedProgressItem[],
	currentActiveId: string | null,
) {
	if (
		wrappedPreviousProgressActiveId &&
		items.some((item) => item.id === wrappedPreviousProgressActiveId)
	) {
		return wrappedPreviousProgressActiveId;
	}

	return currentActiveId;
}
