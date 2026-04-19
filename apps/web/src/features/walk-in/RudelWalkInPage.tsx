import { Linkedin, Share2, Twitter } from "lucide-react";
import { buttonVariants } from "@/app/ui/button";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { buildWalkInHandover } from "@/features/walk-in/lib/build-walk-in-handover";
import type {
	WalkInCallToAction,
	WalkInPreview,
	WalkInWrappedDataState,
} from "@/features/walk-in/lib/walk-in-handover-schema";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export function RudelWalkInPage() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const wrappedV1Query = useAnalyticsQuery({
		...orpc.analytics.wrapped.v1.queryOptions({}),
		enabled: Boolean(session),
	});
	const handover = buildWalkInHandover({
		state: getWrappedDataState({
			hasSession: Boolean(session),
			hasWrappedData: Boolean(wrappedV1Query.data),
			isSessionPending,
			queryIsError: wrappedV1Query.isError,
			queryIsPending: wrappedV1Query.isPending,
		}),
		wrappedData: wrappedV1Query.data ?? null,
	});
	const { canvas, callToActions, description, profile, termsLabel, title } =
		handover.preview;
	const providedImageSrc = profile.avatarSrc;
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
	const accountLabel = name ?? email ?? profile.fallbackLabel;

	return (
		<main className="relative min-h-screen bg-white text-[#121212]">
			<MetricHud preview={handover.preview} />
			<div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
				<div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(340px,440px)_minmax(320px,460px)] lg:items-center lg:justify-center">
					<div className="flex justify-center">
						<div
							className="flex aspect-[9/16] w-full items-center justify-center bg-white shadow-[0_28px_90px_rgba(0,0,0,0.16)] ring-1 ring-black/8"
							style={{
								maxWidth: `${canvas.maxPreviewWidthPx}px`,
								borderRadius: `${canvas.cornerRadiusPx}px`,
								backgroundColor: canvas.backgroundHex,
							}}
						>
							<div className="flex items-center justify-center rounded-full bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-black/5">
								<img
									src={providedImageSrc}
									alt={accountLabel}
									className="size-[112px] rounded-full object-cover"
								/>
							</div>
						</div>
					</div>

					<div className="max-w-xl">
						<h1 className="text-balance font-[var(--app-font-heading)] text-4xl font-semibold tracking-[-0.05em] text-[#111111] sm:text-5xl">
							{title}
						</h1>
						<p className="mt-5 max-w-[34ch] text-pretty text-sm text-black/62 sm:text-base">
							{description}
						</p>
						<div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
							{callToActions.map((callToAction) => (
								<CallToActionButton
									key={callToAction.id}
									callToAction={callToAction}
								/>
							))}
						</div>
						<p className="mt-4 text-xs uppercase tracking-[0.18em] text-black/38">
							{termsLabel}
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}

function MetricHud(props: { preview: WalkInPreview }) {
	const { preview } = props;
	const { hud, metricCandidates } = preview;

	return (
		<aside className="absolute top-6 right-6 z-20 hidden w-[340px] rounded-[22px] border border-black/8 bg-white/92 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.08)] backdrop-blur-sm lg:block">
			<div className="flex items-center justify-between gap-4 border-b border-black/8 pb-4">
				<div>
					<p className="font-mono text-sm uppercase tracking-[0.2em] text-black/44">
						{hud.title}
					</p>
					<p className="mt-2 text-pretty text-sm text-black/62">
						{hud.description}
					</p>
				</div>
				<div className="rounded-full border border-black/10 bg-white px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-black/52">
					{metricCandidates.length} items
				</div>
			</div>
			<div className="mt-4 grid gap-2.5">
				{metricCandidates.map((metric, metricIndex) => (
					<div
						key={metric.id}
						className="flex items-start gap-3 rounded-[14px] border border-black/6 bg-white px-3 py-2.5"
					>
						<div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-black/12 bg-black/[0.03] font-mono text-[10px] text-black/52">
							{metricIndex + 1}
						</div>
						<div className="min-w-0">
							<p className="text-sm text-black/78">{metric.label}</p>
							<p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-black/40">
								{metric.status} / {metric.owner}
							</p>
							{metric.notes ? (
								<p className="mt-1 text-xs leading-relaxed text-black/52">
									{metric.notes}
								</p>
							) : null}
						</div>
					</div>
				))}
			</div>
		</aside>
	);
}

function CallToActionButton(props: { callToAction: WalkInCallToAction }) {
	const { callToAction } = props;
	const icon = getCallToActionIcon(callToAction.kind);
	const className =
		callToAction.kind === "share-x"
			? cn(
					buttonVariants({ size: "lg" }),
					"justify-start rounded-full bg-[#111111] text-white hover:bg-black/86",
				)
			: cn(
					buttonVariants({ size: "lg", variant: "outline" }),
					"justify-start rounded-full border-black/12 bg-white text-[#111111] hover:bg-black/[0.04] hover:text-[#111111]",
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
