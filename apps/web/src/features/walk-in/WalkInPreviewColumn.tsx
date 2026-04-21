import type { WrappedV1 } from "@rudel/api-routes";
import {
	Clipboard,
	Clock3,
	Coins,
	Command,
	Download,
	Layers3,
	Linkedin,
	Share2,
	Twitter,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import type { WalkInCardModel } from "@/features/walk-in/lib/build-walk-in-card-model";
import type {
	WalkInCallToAction,
	WalkInHandover,
	WalkInWrappedDataState,
} from "@/features/walk-in/lib/walk-in-handover-schema";
import { cn } from "@/lib/utils";

export interface WalkInPreviewAction {
	disabled?: boolean;
	icon: ReactNode;
	id: string;
	label: string;
	onClick?: () => void | Promise<void>;
	to?: string;
	variant?: "default" | "outline";
}

interface InsightRowModel {
	icon: ReactNode;
	id: string;
	label: string;
	subtitle: string;
	value: string;
	valueMeta: string;
	valueMetaClassName?: string;
}

export function WalkInPreviewColumn({
	actions,
	cardModel,
	handover,
	wrappedData,
	wrappedDataState,
}: {
	actions?: readonly WalkInPreviewAction[];
	cardModel: WalkInCardModel;
	handover: WalkInHandover;
	wrappedData: WrappedV1 | null;
	wrappedDataState: WalkInWrappedDataState;
}) {
	const resolvedActions =
		actions ?? buildDefaultPreviewActions(handover.preview.callToActions);
	const insightRows: readonly InsightRowModel[] = [
		{
			icon: <Layers3 className="size-4" />,
			id: "sessions",
			label: "Sessions",
			subtitle: "Recorded on this card",
			value: cardModel.totalSessionsLabel,
			valueMeta: "tracked",
		},
		{
			icon: <Command className="size-4" />,
			id: "favorite-model",
			label: "Favorite model",
			subtitle: "Most-used across the season",
			value: cardModel.favoriteModelLabel,
			valueMeta: "top pick",
		},
		{
			icon: <Clock3 className="size-4" />,
			id: "first-session",
			label: "First session",
			subtitle: "Where the story starts",
			value: cardModel.firstSessionLabel,
			valueMeta: "origin",
		},
		{
			icon: <Coins className="size-4" />,
			id: "split",
			label: "Split",
			subtitle: cardModel.sourceSummary,
			value: cardModel.splitLabel,
			valueMeta: "mix",
			valueMetaClassName: "text-emerald-600",
		},
	] as const;

	return (
		<section className="relative z-10 w-full max-w-[30rem] lg:justify-self-start">
			<p className="text-[0.72rem] uppercase tracking-[0.34em] text-muted-foreground">
				Share card
			</p>
			<h1 className="mt-4 max-w-[12ch] text-balance font-[var(--app-font-heading)] text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl lg:text-[3.6rem]">
				{handover.preview.title}
			</h1>
			<p className="mt-5 max-w-[38ch] text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
				{handover.preview.description}
			</p>

			<nav className="mt-8 flex flex-col gap-3 sm:max-w-sm">
				{resolvedActions.map((action) => (
					<CallToActionButton key={action.id} action={action} />
				))}
			</nav>

			<p className="mt-4 max-w-[34ch] text-sm leading-6 text-muted-foreground">
				Share uses the system share sheet when your browser supports image
				sharing. Copy and download stay here as direct fallbacks.
			</p>

			<ul className="mt-8 overflow-hidden rounded-[1.6rem] border border-border/70 bg-card p-0 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
				{insightRows.map((row, rowIndex) => (
					<InsightRow
						key={row.id}
						icon={row.icon}
						isFirstRow={rowIndex === 0}
						label={row.label}
						subtitle={row.subtitle}
						value={row.value}
						valueMeta={row.valueMeta}
						valueMetaClassName={row.valueMetaClassName}
					/>
				))}
			</ul>

			<article className="mt-8 rounded-[1.6rem] border border-border/70 bg-card p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
				<p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
					Share summary
				</p>
				<p className="mt-3 text-lg font-medium tracking-[-0.03em] text-foreground">
					{cardModel.sourceSummary}
				</p>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					{cardModel.totalSessionsLabel} sessions and {cardModel.totalTokensLabel}{" "}
					tokens reduced to one image that still reads without the rest of the
					deck.
				</p>
			</article>

			<p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
				{getFooterLabel(wrappedDataState, wrappedData)}
			</p>
		</section>
	);
}

export const TEAM_CARD_PREVIEW_ACTIONS = [
	{
		icon: <Share2 className="size-4" />,
		id: "share-card",
		label: "Share card",
		to: appRoutes.settingsWorkspace(),
		variant: "default",
	},
	{
		icon: <Clipboard className="size-4" />,
		id: "copy-image",
		label: "Copy image",
		to: `${appRoutes.settingsWorkspace()}#incoming-invitations`,
		variant: "outline",
	},
	{
		icon: <Download className="size-4" />,
		id: "download-png",
		label: "Download PNG",
		to: appRoutes.settingsWorkspace(),
		variant: "outline",
	},
] as const satisfies readonly WalkInPreviewAction[];

function InsightRow(props: {
	icon: ReactNode;
	isFirstRow: boolean;
	label: string;
	subtitle: string;
	value: string;
	valueMeta: string;
	valueMetaClassName?: string;
}) {
	const {
		icon,
		isFirstRow,
		label,
		subtitle,
		value,
		valueMeta,
		valueMetaClassName,
	} = props;

	return (
		<li
			className={cn(
				"list-none px-4 py-3.5",
				isFirstRow ? null : "border-t border-border/60",
			)}
		>
			<div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 gap-y-2">
				<span className="row-span-2 flex size-11 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
					{icon}
				</span>
				<div className="flex min-w-0 items-start justify-between gap-3">
					<p className="min-w-0 text-[1.02rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground">
						{label}
					</p>
					<p className="max-w-[9.5rem] text-right text-[1.02rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground min-[360px]:max-w-[11rem]">
						{value}
					</p>
				</div>
				<div className="flex min-w-0 items-start justify-between gap-3">
					<p className="min-w-0 text-[0.92rem] leading-[1.25] text-muted-foreground">
						{subtitle}
					</p>
					<p
						className={cn(
							"shrink-0 text-right text-[0.92rem] leading-[1.25] text-muted-foreground",
							valueMetaClassName,
						)}
					>
						{valueMeta}
					</p>
				</div>
					</div>
		</li>
	);
}

function getFooterLabel(
	state: WalkInWrappedDataState,
	wrappedData: WrappedV1 | null,
) {
	if (state === "loading") {
		return "Loading workspace metrics";
	}

	if (state === "error") {
		return "Live analytics unavailable - showing seed card";
	}

	if (wrappedData) {
		return `${wrappedData.verified_metric_count} verified metrics`;
	}

	return "Seed trading card preview";
}

function buildDefaultPreviewActions(
	callToActions: readonly WalkInCallToAction[],
): readonly WalkInPreviewAction[] {
	return callToActions.map((callToAction) => ({
		icon: getCallToActionIcon(callToAction.kind),
		id: callToAction.id,
		label: callToAction.label,
		variant: callToAction.kind === "share-x" ? "default" : "outline",
	}));
}

function CallToActionButton(props: { action: WalkInPreviewAction }) {
	const { action } = props;
	const className =
		action.variant === "default"
			? cn(
					buttonVariants({ size: "lg" }),
					"min-h-11 justify-start rounded-full",
				)
			: cn(
					buttonVariants({ size: "lg", variant: "outline" }),
					"min-h-11 justify-start rounded-full border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
				);

	if (action.to) {
		return (
			<Link to={action.to} className={className}>
				{action.icon}
				{action.label}
			</Link>
		);
	}

	return (
		<button
			type="button"
			className={className}
			disabled={action.disabled}
			onClick={() => void action.onClick?.()}
		>
			{action.icon}
			{action.label}
		</button>
	);
}

function getCallToActionIcon(kind: WalkInCallToAction["kind"]) {
	switch (kind) {
		case "share-linkedin":
			return <Linkedin className="size-4" />;
		case "follow-x":
			return <Twitter className="size-4" />;
		case "share-x":
			return <Share2 className="size-4" />;
	}
}
