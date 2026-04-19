import type { WrappedV1 } from "@rudel/api-routes";
import {
	ArrowUpRightIcon,
	Clock3,
	Coins,
	Command,
	Layers3,
	Linkedin,
	Settings2Icon,
	Share2,
	Twitter,
	UserPlus,
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
	icon: ReactNode;
	id: string;
	label: string;
	to?: string;
	variant?: "default" | "outline";
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

	return (
		<section className="relative z-10 max-w-[30rem] lg:justify-self-start">
			<p className="text-[0.72rem] uppercase tracking-[0.34em] text-muted-foreground">
				Walk-In / Root Card Runtime
			</p>
			<h1 className="mt-4 max-w-[12ch] text-balance font-[var(--app-font-heading)] text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl lg:text-[3.6rem]">
				{handover.preview.title}
			</h1>
			<p className="mt-5 max-w-[38ch] text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
				{handover.preview.description}
			</p>

			<ul className="mt-8 grid gap-3 p-0 sm:grid-cols-2">
				<InsightCard
					icon={<Layers3 className="size-4" />}
					label="Archetype"
					value={cardModel.archetypeLabel}
				/>
				<InsightCard
					icon={<Command className="size-4" />}
					label="Favorite model"
					value={cardModel.favoriteModelLabel}
				/>
				<InsightCard
					icon={<Clock3 className="size-4" />}
					label="First recorded session"
					value={cardModel.firstSessionLabel}
				/>
				<InsightCard
					icon={<Coins className="size-4" />}
					label="Split"
					value={cardModel.splitLabel}
				/>
			</ul>

			<article className="mt-8 rounded-[1.6rem] border border-border/70 bg-card p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
				<p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
					Card readout
				</p>
				<p className="mt-3 text-lg font-medium tracking-[-0.03em] text-foreground">
					{cardModel.sourceSummary}
				</p>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					{cardModel.totalSessionsLabel} sessions, {cardModel.totalTokensLabel}{" "}
					tokens, and the root-card visual language adapted into the full mymind
					front/back WebGL runtime.
				</p>
			</article>

			<nav className="mt-8 flex flex-col gap-3 sm:max-w-sm">
				{resolvedActions.map((action) => (
					<CallToActionButton key={action.id} action={action} />
				))}
			</nav>

			<p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
				{getFooterLabel(wrappedDataState, wrappedData)}
			</p>
		</section>
	);
}

export const TEAM_CARD_PREVIEW_ACTIONS = [
	{
		icon: <UserPlus className="size-4" />,
		id: "invite-teammates",
		label: "Invite teammates",
		to: appRoutes.settingsWorkspace(),
		variant: "default",
	},
	{
		icon: <ArrowUpRightIcon className="size-4" />,
		id: "incoming-invites",
		label: "Pending invitations",
		to: `${appRoutes.settingsWorkspace()}#incoming-invitations`,
		variant: "outline",
	},
	{
		icon: <Settings2Icon className="size-4" />,
		id: "workspace-settings",
		label: "Open workspace settings",
		to: appRoutes.settingsWorkspace(),
		variant: "outline",
	},
] as const satisfies readonly WalkInPreviewAction[];

function InsightCard(props: { icon: ReactNode; label: string; value: string }) {
	const { icon, label, value } = props;

	return (
		<li className="list-none rounded-[1.35rem] border border-border/70 bg-card p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
			<div className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
				<span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-background text-foreground">
					{icon}
				</span>
				{label}
			</div>
			<p className="mt-4 text-sm font-medium leading-6 text-foreground">
				{value}
			</p>
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
			? cn(buttonVariants({ size: "lg" }), "justify-start rounded-full")
			: cn(
					buttonVariants({ size: "lg", variant: "outline" }),
					"justify-start rounded-full border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
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
		<button type="button" className={className}>
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
