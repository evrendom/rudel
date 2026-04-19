import type { WrappedSourceSplit, WrappedV1 } from "@rudel/api-routes";
import { Linkedin, Share2, Twitter } from "lucide-react";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import { Card, CardContent, CardFooter } from "@/app/ui/card";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { walkInHandoverData } from "@/features/walk-in/data/walk-in-handover-data";
import { buildWalkInHandover } from "@/features/walk-in/lib/build-walk-in-handover";
import type {
	WalkInCallToAction,
	WalkInWrappedDataState,
} from "@/features/walk-in/lib/walk-in-handover-schema";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

const WHOLE_CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 0,
	style: "currency",
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const SEED_SOURCE_SPLIT: readonly WrappedSourceSplit[] = [
	{
		session_count: 78,
		session_share_percent: 61,
		source: "claude_code",
	},
	{
		session_count: 50,
		session_share_percent: 39,
		source: "codex",
	},
];

const SEED_METRICS: WrappedV1["metrics"] = {
	active_days: 37,
	days_since_first_session: 214,
	estimated_spend_usd: 126,
	favorite_model: "Claude Sonnet 4",
	first_session_at: "2025-09-17T00:00:00Z",
	last_session_at: "2026-04-18T00:00:00Z",
	longest_session_min: 164,
	source_split: [...SEED_SOURCE_SPLIT],
	total_sessions: 128,
	total_tokens: 482_300,
};

interface SpotifyStyleCardMetric {
	label: string;
	value: string;
}

interface SpotifyStyleCardPalette {
	accentBadgeClassName: string;
	accentStripeClassName: string;
	dominantToneClassName: string;
	surfaceTintClassName: string;
}

interface SpotifyStyleCardSection {
	items: string[];
	title: string;
}

interface SpotifyStyleSummaryItem {
	detail: string;
	label: string;
	value: string;
}

interface SpotifyStyleCardData {
	accentBadgeLabel: string;
	displayName: string;
	footerLabel: string;
	highlightBadgeLabel: string;
	largeMetrics: SpotifyStyleCardMetric[];
	palette: SpotifyStyleCardPalette;
	sections: SpotifyStyleCardSection[];
	summaryItems: SpotifyStyleSummaryItem[];
	watermarkLabel: string;
}

const SPOTIFY_STYLE_ROUTE_VARIANT = {
	footerLabel: "rudel.ai/spotify-style",
	routeBadgeLabel: "Spotify-style",
};

export function SpotifyStyleWalkInPage() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const wrappedV1Query = useAnalyticsQuery({
		...orpc.analytics.wrapped.v1.queryOptions({}),
		enabled: Boolean(session),
	});
	const wrappedState = getWrappedDataState({
		hasSession: Boolean(session),
		hasWrappedData: Boolean(wrappedV1Query.data),
		isSessionPending,
		queryIsError: wrappedV1Query.isError,
		queryIsPending: wrappedV1Query.isPending,
	});
	const handover = buildWalkInHandover({
		state: wrappedState,
		wrappedData: wrappedV1Query.data ?? null,
	});
	const accountLabel = getAccountLabel(
		session,
		handover.preview.profile.fallbackLabel,
	);
	const cardData = buildSpotifyStyleCardData({
		accountLabel,
		state: wrappedState,
		wrappedData: wrappedV1Query.data ?? null,
	});

	return (
		<main className="isolate min-h-dvh bg-background text-foreground antialiased">
			<div className="mx-auto flex min-h-dvh max-w-7xl items-center justify-center px-6 py-12">
				<div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(340px,440px)_minmax(320px,520px)] lg:items-center lg:justify-center">
					<div className="flex justify-center">
						<SpotifyStyleWrappedCard
							accountLabel={accountLabel}
							avatarSrc={handover.preview.profile.avatarSrc}
							cardData={cardData}
						/>
					</div>

					<div className="max-w-xl">
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">
								{SPOTIFY_STYLE_ROUTE_VARIANT.routeBadgeLabel}
							</Badge>
							<Badge variant="secondary">{cardData.highlightBadgeLabel}</Badge>
						</div>

						<h1 className="mt-5 max-w-[12ch] text-balance font-[var(--app-font-heading)] text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
							{handover.preview.title}
						</h1>
						<p className="mt-4 max-w-[34ch] text-pretty text-base text-muted-foreground">
							{handover.preview.description}
						</p>

						<SummaryStrip items={cardData.summaryItems} />

						<div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
							{handover.preview.callToActions.map((callToAction) => (
								<CallToActionButton
									key={callToAction.id}
									callToAction={callToAction}
								/>
							))}
						</div>
						<p className="mt-4 font-mono text-[0.6875rem] tracking-wide uppercase text-muted-foreground">
							{handover.preview.termsLabel}
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}

function SpotifyStyleWrappedCard(props: {
	accountLabel: string;
	avatarSrc: string;
	cardData: SpotifyStyleCardData;
}) {
	const { accountLabel, avatarSrc, cardData } = props;

	return (
		<Card className="relative aspect-[9/16] w-full max-w-[27.5rem] gap-0 overflow-hidden rounded-[2rem] border border-border/70 bg-card py-0 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
			<div
				className={cn(
					"relative h-[45%] overflow-hidden border-b border-border/70 bg-muted/20",
					cardData.palette.surfaceTintClassName,
				)}
			>
				<div
					className={cn(
						"absolute inset-y-0 left-0 w-[23%]",
						cardData.palette.accentStripeClassName,
					)}
				/>
				<div className="absolute inset-y-0 right-0 left-[18%] bg-[repeating-linear-gradient(90deg,rgba(15,23,42,0.08)_0_1.5rem,transparent_1.5rem_3rem)] opacity-80" />
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.92),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.24),transparent_72%)]" />
				<div className="absolute inset-y-[18%] left-[4%] w-36 rounded-full border border-foreground/12" />
				<div className="absolute bottom-[10%] left-[10%] size-28 rounded-full border border-foreground/12" />
				<div className="absolute right-[-4%] bottom-[-13%] font-[var(--app-font-heading)] text-[8rem] font-semibold tracking-tight text-foreground/8 sm:text-[9rem]">
					{cardData.watermarkLabel}
				</div>
				<div className="absolute left-[-19%] top-[44%] -rotate-90 font-[var(--app-font-heading)] text-[4rem] font-semibold tracking-tight text-transparent [-webkit-text-stroke:1.5px_rgba(15,23,42,0.34)]">
					{cardData.displayName.toUpperCase()}
				</div>

				<div className="absolute top-4 right-4 flex gap-2">
					<Badge variant="outline">
						{SPOTIFY_STYLE_ROUTE_VARIANT.routeBadgeLabel}
					</Badge>
					<Badge
						variant="outline"
						className={cn(
							"border-transparent",
							cardData.palette.accentBadgeClassName,
						)}
					>
						{cardData.accentBadgeLabel}
					</Badge>
				</div>

				<div className="absolute top-[8%] left-1/2 aspect-square w-[72%] -translate-x-1/2 overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-background shadow-[0_16px_34px_rgba(15,23,42,0.12)]">
					<img
						alt={`${accountLabel} portrait`}
						className="size-full object-cover"
						src={avatarSrc}
					/>
				</div>

				<div className="absolute right-4 bottom-4">
					<Badge
						variant="outline"
						className={cn(
							"border-transparent bg-background/92 backdrop-blur-sm",
							cardData.palette.dominantToneClassName,
						)}
					>
						{cardData.highlightBadgeLabel}
					</Badge>
				</div>
			</div>

			<CardContent className="flex flex-1 flex-col gap-6 px-7 py-7">
				<div className="grid grid-cols-2 gap-8">
					{cardData.sections.map((section) => (
						<SpotifyStyleCardSectionBlock
							key={section.title}
							section={section}
						/>
					))}
				</div>

				<div className="mt-auto grid grid-cols-2 gap-6 border-t border-border/70 pt-6">
					{cardData.largeMetrics.map((metric) => (
						<div key={metric.label}>
							<p className="truncate text-sm font-medium text-muted-foreground">
								{metric.label}
							</p>
							<p className="mt-2 font-[var(--app-font-heading)] text-[2.25rem] font-semibold tracking-tight text-foreground tabular-nums">
								{metric.value}
							</p>
						</div>
					))}
				</div>
			</CardContent>

			<CardFooter className="items-center justify-between border-t border-border/70 px-7 py-5">
				<div className="flex size-10 items-center justify-center rounded-full border border-border/70 bg-background font-[var(--app-font-heading)] text-sm font-semibold text-foreground">
					R
				</div>
				<p className="font-mono text-[0.75rem] tracking-wide uppercase text-muted-foreground">
					{SPOTIFY_STYLE_ROUTE_VARIANT.footerLabel}
				</p>
			</CardFooter>
		</Card>
	);
}

function SpotifyStyleCardSectionBlock(props: {
	section: SpotifyStyleCardSection;
}) {
	const { section } = props;

	return (
		<div>
			<h2 className="truncate text-sm font-medium text-muted-foreground">
				{section.title}
			</h2>
			<ol className="mt-3 space-y-2">
				{section.items.map((item, index) => (
					<li
						key={`${section.title}-${item}`}
						className="grid grid-cols-[1rem_1fr] gap-2"
					>
						<p className="text-sm tabular-nums text-muted-foreground">
							{index + 1}
						</p>
						<p className="text-base font-medium text-foreground">{item}</p>
					</li>
				))}
			</ol>
		</div>
	);
}

function SummaryStrip(props: { items: readonly SpotifyStyleSummaryItem[] }) {
	const { items } = props;

	return (
		<div className="mt-8 grid gap-4 border-y border-border/70 py-5 sm:grid-cols-3">
			{items.map((item, index) => (
				<div
					key={item.label}
					className={cn(
						"min-w-0",
						index > 0 && "sm:border-l sm:border-border/70 sm:pl-4",
					)}
				>
					<p className="truncate font-mono text-[0.6875rem] tracking-wide uppercase text-muted-foreground">
						{item.label}
					</p>
					<p className="mt-1 text-balance font-[var(--app-font-heading)] text-xl font-semibold tracking-tight text-foreground">
						{item.value}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
				</div>
			))}
		</div>
	);
}

function CallToActionButton(props: { callToAction: WalkInCallToAction }) {
	const { callToAction } = props;

	return (
		<Button
			type="button"
			size="lg"
			variant={callToAction.kind === "share-x" ? "default" : "outline"}
			className={
				callToAction.kind === "share-x"
					? "justify-start rounded-full bg-foreground text-background hover:bg-foreground/90"
					: "justify-start rounded-full"
			}
		>
			{getCallToActionIcon(callToAction.kind)}
			{callToAction.label}
		</Button>
	);
}

function buildSpotifyStyleCardData(params: {
	accountLabel: string;
	state: WalkInWrappedDataState;
	wrappedData: WrappedV1 | null;
}): SpotifyStyleCardData {
	const { accountLabel, state, wrappedData } = params;
	const metrics = wrappedData?.metrics ?? SEED_METRICS;
	const sourceSplit = normalizeSourceSplit(metrics.source_split);
	const dominantSource = getDominantSource(sourceSplit);
	const displayName = getDisplayName(accountLabel);
	const dominantShareLabel = `${dominantSource.label} ${Math.round(dominantSource.sharePercent)}%`;
	const tokensPerSession =
		metrics.total_sessions > 0
			? metrics.total_tokens / metrics.total_sessions
			: 0;
	const firstSessionLabel = formatShortDate(metrics.first_session_at);
	const palette = getSpotifyStylePalette(dominantSource.source);

	return {
		accentBadgeLabel: dominantSource.label,
		displayName,
		footerLabel: SPOTIFY_STYLE_ROUTE_VARIANT.footerLabel,
		highlightBadgeLabel: getHighlightBadgeLabel(state),
		largeMetrics: [
			{
				label: "Total Tokens",
				value: COMPACT_NUMBER_FORMATTER.format(metrics.total_tokens),
			},
			{
				label: "Est. Spend",
				value: WHOLE_CURRENCY_FORMATTER.format(metrics.estimated_spend_usd),
			},
		],
		palette,
		sections: [
			{
				items: [
					`${INTEGER_FORMATTER.format(metrics.total_sessions)} sessions total`,
					`${INTEGER_FORMATTER.format(metrics.active_days)} active days`,
					`${Math.round(metrics.longest_session_min)} minute lock-in`,
					`${WHOLE_CURRENCY_FORMATTER.format(metrics.estimated_spend_usd)} estimated spend`,
					`Started ${firstSessionLabel}`,
				],
				title: "Top Metrics",
			},
			{
				items: [
					metrics.favorite_model ?? "Claude Sonnet 4",
					dominantShareLabel,
					`${sourceSplit.claudeShare}% Claude / ${sourceSplit.codexShare}% Codex`,
					`${INTEGER_FORMATTER.format(metrics.days_since_first_session)} days since first use`,
					`${COMPACT_NUMBER_FORMATTER.format(tokensPerSession)} tokens / session`,
				],
				title: "Top Signals",
			},
		],
		summaryItems: [
			{
				detail: `Started ${formatLongDate(metrics.first_session_at)}`,
				label: "Favorite model",
				value: metrics.favorite_model ?? "Claude Sonnet 4",
			},
			{
				detail: `${sourceSplit.claudeShare}% Claude / ${sourceSplit.codexShare}% Codex`,
				label: "Dominant source",
				value: dominantSource.label,
			},
			{
				detail: `${COMPACT_NUMBER_FORMATTER.format(tokensPerSession)} tokens per session`,
				label: "Active window",
				value: `${INTEGER_FORMATTER.format(metrics.days_since_first_session)} days`,
			},
		],
		watermarkLabel: getWatermarkLabel(dominantSource.source),
	};
}

function getSpotifyStylePalette(
	dominantSource: WrappedSourceSplit["source"],
): SpotifyStyleCardPalette {
	if (dominantSource === "claude_code") {
		return {
			accentBadgeClassName: "bg-emerald-100 text-emerald-950",
			accentStripeClassName: "bg-emerald-300",
			dominantToneClassName: "text-emerald-950",
			surfaceTintClassName: "bg-emerald-950/[0.03]",
		};
	}

	if (dominantSource === "codex") {
		return {
			accentBadgeClassName: "bg-sky-100 text-sky-950",
			accentStripeClassName: "bg-sky-300",
			dominantToneClassName: "text-sky-950",
			surfaceTintClassName: "bg-sky-950/[0.03]",
		};
	}

	return {
		accentBadgeClassName: "bg-amber-100 text-amber-950",
		accentStripeClassName: "bg-amber-300",
		dominantToneClassName: "text-amber-950",
		surfaceTintClassName: "bg-amber-950/[0.03]",
	};
}

function normalizeSourceSplit(sourceSplit: readonly WrappedSourceSplit[]) {
	const claudeShare = Math.round(
		getSourceSharePercent(sourceSplit, "claude_code"),
	);
	const codexShare = Math.round(getSourceSharePercent(sourceSplit, "codex"));

	if (claudeShare === 0 && codexShare === 0) {
		return {
			claudeShare: 61,
			codexShare: 39,
		};
	}

	return {
		claudeShare,
		codexShare,
	};
}

function getDominantSource(sourceSplit: {
	claudeShare: number;
	codexShare: number;
}): {
	label: string;
	sharePercent: number;
	source: WrappedSourceSplit["source"];
} {
	if (sourceSplit.claudeShare > sourceSplit.codexShare) {
		return {
			label: "Claude Code",
			sharePercent: sourceSplit.claudeShare,
			source: "claude_code",
		};
	}

	if (sourceSplit.codexShare > sourceSplit.claudeShare) {
		return {
			label: "Codex",
			sharePercent: sourceSplit.codexShare,
			source: "codex",
		};
	}

	return {
		label: "Two-track",
		sharePercent: 50,
		source: "claude_code",
	};
}

function getWatermarkLabel(source: WrappedSourceSplit["source"]): string {
	if (source === "claude_code") {
		return "CC";
	}

	if (source === "codex") {
		return "CX";
	}

	return "AI";
}

function getHighlightBadgeLabel(state: WalkInWrappedDataState): string {
	if (state === "live") {
		return "Live wrapped data";
	}

	if (state === "loading") {
		return "Loading wrapped data";
	}

	if (state === "error") {
		return "Using fallback data";
	}

	return "Seed preview";
}

function getSourceSharePercent(
	sourceSplit: readonly WrappedSourceSplit[],
	source: WrappedSourceSplit["source"],
): number {
	return (
		sourceSplit.find((sourceEntry) => sourceEntry.source === source)
			?.session_share_percent ?? 0
	);
}

function formatLongDate(value: string | null): string {
	if (!value) {
		return "No start date yet";
	}

	return LONG_DATE_FORMATTER.format(new Date(value));
}

function formatShortDate(value: string | null): string {
	if (!value) {
		return "No start date yet";
	}

	return SHORT_DATE_FORMATTER.format(new Date(value));
}

function getDisplayName(accountLabel: string): string {
	if (accountLabel.includes("@")) {
		return (
			accountLabel.split("@")[0] ||
			walkInHandoverData.preview.profile.fallbackLabel
		);
	}

	return accountLabel || walkInHandoverData.preview.profile.fallbackLabel;
}

function getAccountLabel(
	session: ReturnType<typeof authClient.useSession>["data"],
	fallbackLabel: string,
): string {
	const name =
		session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
			? session.user.name
			: undefined;
	const email =
		session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
			? session.user.email
			: undefined;

	return name ?? email ?? fallbackLabel;
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

function getWrappedDataState(params: {
	hasSession: boolean;
	hasWrappedData: boolean;
	isSessionPending: boolean;
	queryIsError: boolean;
	queryIsPending: boolean;
}): WalkInWrappedDataState {
	if (params.hasWrappedData) {
		return "live";
	}

	if (params.isSessionPending || (params.hasSession && params.queryIsPending)) {
		return "loading";
	}

	if (params.hasSession && params.queryIsError) {
		return "error";
	}

	return "seed";
}
