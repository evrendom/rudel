import type { ComponentType } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	formatModelDisplayLabel,
	getModelBadgeTone,
	getModelIdentityIconClassName,
} from "./dashboard-model-brand";

type DashboardModelBadgeSize = "sm" | "md" | "table";

type ModelBadgeSizeClasses = {
	badgeClassName: string;
	iconClassName: string;
	labelClassName: string;
	paddingClassName: string;
};

function shouldHideModelBadge(model: string) {
	const normalizedModel = model
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "");

	return normalizedModel.includes("synthetic");
}

function getModelBadgeSizeClasses(
	size: DashboardModelBadgeSize,
): ModelBadgeSizeClasses {
	if (size === "md") {
		return {
			badgeClassName:
				"h-8 gap-2 text-[0.8125rem] font-medium tracking-[-0.01em]",
			iconClassName: "size-3.5 shrink-0",
			labelClassName:
				"flex min-w-0 items-center leading-none [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]",
			paddingClassName: "px-3",
		};
	}

	if (size === "table") {
		return {
			badgeClassName:
				"h-5 gap-1 text-base font-medium tracking-[-0.01em] sm:text-sm",
			iconClassName: "size-3 shrink-0",
			labelClassName:
				"flex min-w-0 items-center leading-none [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]",
			paddingClassName: "px-2",
		};
	}

	return {
		badgeClassName:
			"h-5 gap-1 text-[0.6875rem] font-semibold tracking-[-0.01em]",
		iconClassName: "size-3 shrink-0",
		labelClassName:
			"flex min-w-0 items-center leading-none [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]",
		paddingClassName: "px-2",
	};
}

export function ClaudeModelIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 1200 1200" aria-hidden="true" className={className}>
			<path
				fill="currentColor"
				d="M233.96 800.21L468.64 668.54L472.59 657.1L468.64 650.74L457.21 650.74L417.99 648.32L283.89 644.7L167.6 639.87L54.93 633.83L26.58 627.79L0 592.75L2.74 575.28L26.58 559.25L60.72 562.23L136.19 567.38L249.42 575.19L331.57 580.03L453.26 592.67L472.59 592.67L475.33 584.86L468.72 580.03L463.57 575.19L346.39 495.79L219.54 411.87L153.1 363.54L117.18 339.06L99.06 316.11L91.25 266.01L123.87 230.09L167.68 233.07L178.87 236.05L223.25 270.2L318.04 343.57L441.83 434.74L459.95 449.8L467.19 444.64L468.08 441.02L459.95 427.41L392.62 305.72L320.78 181.93L288.81 130.63L280.35 99.87C277.37 87.22 275.19 76.59 275.19 63.62L312.32 13.21L332.86 6.6L382.39 13.21L403.25 31.33L434.01 101.72L483.87 212.54L561.18 363.22L583.81 407.92L595.89 449.32L600.4 461.96L608.21 461.96L608.21 454.71L614.58 369.83L626.34 265.61L637.77 131.52L641.72 93.75L660.4 48.48L697.53 24L726.52 37.85L750.36 72L747.06 94.07L732.89 186.2L705.1 330.52L686.98 427.17L697.53 427.17L709.61 415.09L758.5 350.17L840.64 247.49L876.89 206.74L919.17 161.72L946.31 140.3L997.61 140.3L1035.38 196.43L1018.47 254.42L965.64 321.42L921.83 378.2L859.01 462.77L819.79 530.42L823.41 535.81L832.75 534.93L974.66 504.72L1051.33 490.87L1142.82 475.17L1184.21 494.5L1188.72 514.15L1172.46 554.34L1074.6 578.5L959.84 601.45L788.94 641.88L786.85 643.41L789.26 646.39L866.26 653.64L899.19 655.41L979.81 655.41L1129.93 666.6L1169.15 692.54L1192.67 724.27L1188.72 748.43L1128.32 779.19L1046.82 759.87L856.59 714.6L791.36 698.34L782.34 698.34L782.34 703.73L836.7 756.89L936.32 846.85L1061.07 962.82L1067.44 991.49L1051.41 1014.12L1034.5 1011.7L924.89 929.23L882.6 892.11L786.85 811.49L780.48 811.49L780.48 819.95L802.55 852.24L919.09 1027.41L925.13 1081.13L916.67 1098.6L886.47 1109.15L853.29 1103.11L785.07 1007.36L714.68 899.52L657.91 802.87L650.98 806.82L617.48 1167.7L601.77 1186.15L565.53 1200L535.33 1177.05L519.3 1139.92L535.33 1066.55L554.66 970.79L570.36 894.68L584.54 800.13L592.99 768.72L592.43 766.63L585.5 767.52L514.23 865.37L405.83 1011.87L320.05 1103.68L299.52 1111.81L263.92 1093.37L267.22 1060.43L287.11 1031.11L405.83 880.11L477.42 786.52L523.65 732.48L523.33 724.67L520.59 724.67L205.29 929.4L149.15 936.64L124.99 914.01L127.97 876.89L139.41 864.81L234.2 799.57L233.88 799.89Z"
			/>
		</svg>
	);
}

export function CodexModelIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 320 320" aria-hidden="true" className={className}>
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}

/**
 * The vendor mark for a raw model id, for places that name a model outside a
 * badge. Null when the vendor is unrecognized, so callers can pick a fallback.
 */
function getModelIconComponent(
	model: string | undefined,
): ComponentType<{ className?: string }> | null {
	if (!model) {
		return null;
	}

	const { icon } = getModelBadgeTone(model);

	if (icon === "claude") {
		return ClaudeModelIcon;
	}

	if (icon === "codex") {
		return CodexModelIcon;
	}

	return null;
}

export function DashboardModelIdentity({
	className,
	model,
	messageCount,
}: {
	className: string;
	model: string;
	messageCount: number | undefined;
}) {
	if (shouldHideModelBadge(model)) {
		return null;
	}

	const ModelIcon = getModelIconComponent(model);
	const modelLabel = formatModelDisplayLabel(model);
	const safeMessageCount = messageCount ?? 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn("cursor-help", className)}>
					{ModelIcon ? (
						<ModelIcon
							className={`size-4 h-lh shrink-0 ${getModelIdentityIconClassName(model)}`}
						/>
					) : null}
					<div className="shrink-0 font-mono text-base font-semibold tracking-normal text-[color:var(--dashboardy-heading)] tabular-nums sm:text-[0.8125rem]">
						{safeMessageCount}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				{modelLabel}: {safeMessageCount} messages
			</TooltipContent>
		</Tooltip>
	);
}

export function DashboardModelBadges({
	models,
	size = "sm",
}: {
	models: string[];
	size?: DashboardModelBadgeSize;
}) {
	const visibleModels = models.filter((model) => !shouldHideModelBadge(model));
	const sizeClasses = getModelBadgeSizeClasses(size);

	if (visibleModels.length === 0) {
		return (
			<span
				className={cn(
					"text-[color:var(--dashboardy-muted)]",
					size === "table"
						? "text-base font-medium tracking-[-0.01em] sm:text-sm"
						: "text-[12px]",
				)}
			>
				—
			</span>
		);
	}

	return (
		<>
			{visibleModels.map((model) => {
				const badgeTone = getModelBadgeTone(model);
				const modelLabel = formatModelDisplayLabel(model);

				return (
					<span
						key={model}
						className={`inline-flex max-w-full items-center justify-center rounded-full border leading-none tabular-nums ${sizeClasses.badgeClassName} ${sizeClasses.paddingClassName} ${badgeTone.chipClassName}`}
					>
						{badgeTone.icon === "claude" ? (
							<ClaudeModelIcon className={sizeClasses.iconClassName} />
						) : badgeTone.icon === "codex" ? (
							<CodexModelIcon className={sizeClasses.iconClassName} />
						) : null}
						<span className={sizeClasses.labelClassName}>
							<span className="truncate">{modelLabel}</span>
						</span>
					</span>
				);
			})}
		</>
	);
}
