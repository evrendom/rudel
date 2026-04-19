import {
	Clock3,
	Coins,
	Command,
	Layers3,
	Linkedin,
	Share2,
	Twitter,
} from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/app/ui/button";
import type {
	WalkInCallToAction,
	WalkInWrappedDataState,
} from "@/features/walk-in/lib/walk-in-handover-schema";
import { MymindWrappedCard } from "@/features/walk-in/MymindWrappedCard";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { cn } from "@/lib/utils";

export function RudelWalkInPage() {
	const { state: workspaceState } = useOrganization();
	const {
		accountLabel,
		cardModel,
		handover,
		session,
		wrappedData,
		wrappedDataState,
	} = useWalkInCardData();
	const organizationName = workspaceState.activeOrg?.name ?? "Rudel";
	const organizationLogoSrc =
		workspaceState.activeOrg?.logo ?? "/logo-dark.svg";
	const avatarSrc =
		typeof session?.user?.image === "string"
			? session.user.image
			: handover.preview.profile.avatarSrc;

	return (
		<main className="mymind-walk-in-route">
			<section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-6 py-10 text-foreground sm:px-8 lg:grid-cols-[minmax(20rem,34rem)_minmax(18rem,1fr)] lg:gap-12 lg:px-12">
				<MymindWrappedCard
					accountLabel={accountLabel}
					avatarSrc={avatarSrc}
					className="justify-self-center lg:justify-self-start"
					model={cardModel}
					organizationLogoSrc={organizationLogoSrc}
					organizationName={organizationName}
				/>

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

					<ul className="mt-8 grid gap-3 sm:grid-cols-2">
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
							{cardModel.totalSessionsLabel} sessions,{" "}
							{cardModel.totalTokensLabel} tokens, and the root-card visual
							language adapted into the full mymind front/back WebGL runtime.
						</p>
					</article>

					<nav className="mt-8 flex flex-col gap-3 sm:max-w-sm">
						{handover.preview.callToActions.map((callToAction) => (
							<CallToActionButton
								key={callToAction.id}
								callToAction={callToAction}
							/>
						))}
					</nav>

					<p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
						{getFooterLabel(wrappedDataState, wrappedData)}
					</p>
				</section>
			</section>
		</main>
	);
}

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
	wrappedData: { verified_metric_count: number } | null,
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

function CallToActionButton(props: { callToAction: WalkInCallToAction }) {
	const { callToAction } = props;
	const icon = getCallToActionIcon(callToAction.kind);
	const className =
		callToAction.kind === "share-x"
			? cn(buttonVariants({ size: "lg" }), "justify-start rounded-full")
			: cn(
					buttonVariants({ size: "lg", variant: "outline" }),
					"justify-start rounded-full border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
				);

	return (
		<button type="button" className={className}>
			{icon}
			{callToAction.label}
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
