import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import {
	ArrowLeft,
	CheckCircle2,
	Clipboard,
	Download,
	Plane,
	Twitter,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { appRoutes } from "@/app/routes";
import {
	formatCompactWholeNumber,
	formatCurrency,
	formatNumber,
} from "@/lib/format";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
	shareToX,
} from "@/lib/screenshot";
import type { WrappedFamilySpendStory } from "./useWrappedFamilySpendData";

gsap.registerPlugin(CustomEase, MotionPathPlugin);

CustomEase.create("wfFlightyEnter", "M0,0 C0.12,0.8 0.22,1 1,1");
CustomEase.create("wfFlightyCount", "M0,0 C0.15,0.72 0.08,1 1,1");

const BOARD_CELL_COUNT = 14;
const BAR_COUNT = 11;
const BOARD_CELL_IDS = Array.from(
	{ length: BOARD_CELL_COUNT },
	(_, index) => `cell-${index}`,
);
const BAR_IDS = Array.from({ length: BAR_COUNT }, (_, index) => `bar-${index}`);

type BoardRow = {
	id: string;
	left: string;
	middle: string;
	right: string;
	status: string;
};

function formatBoardDate(value: string) {
	const date = new Date(`${value}T00:00:00`);

	return new Intl.DateTimeFormat("en-US", {
		day: "2-digit",
		month: "short",
	})
		.format(date)
		.toUpperCase();
}

function shortenLabel(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 1)}…`;
}

function getBoardRows(story: WrappedFamilySpendStory): BoardRow[] {
	const modelLabel = shortenLabel(
		story.favoriteModel?.toUpperCase() ?? "AUTOPILOT",
		12,
	);

	return [
		{
			id: "spend",
			left: "TOTAL SPEND",
			middle: formatCurrency(story.totalCost).toUpperCase(),
			right: "RUNWAY",
			status: story.spendDescriptor.toUpperCase(),
		},
		{
			id: "tokens",
			left: "TOKENS",
			middle: formatCompactWholeNumber(story.totalTokens).toUpperCase(),
			right: "FLOW",
			status: "LIVE",
		},
		{
			id: "sessions",
			left: "SESSIONS",
			middle: formatNumber(story.sessionCount),
			right: "OPS",
			status: "TRACKED",
		},
		{
			id: "days",
			left: "ACTIVE DAYS",
			middle: formatNumber(story.activeDays),
			right: "WINDOW",
			status: "LOCKED",
		},
		{
			id: "period",
			left: formatBoardDate(story.periodStart),
			middle: "TO",
			right: formatBoardDate(story.periodEnd),
			status: "SEASON",
		},
		{
			id: "model",
			left: "MODEL",
			middle: modelLabel,
			right: "CREW",
			status: "READY",
		},
	];
}

function getBarHeights(normalizedSpend: number) {
	return Array.from({ length: BAR_COUNT }, (_, index) => {
		const centerBias =
			1 - Math.abs(index - (BAR_COUNT - 1) / 2) / Math.max(BAR_COUNT - 1, 1);
		const wave = Math.sin(index * 0.82 + normalizedSpend * Math.PI * 1.8) * 0.1;
		const height = 0.24 + normalizedSpend * 0.52 + centerBias * 0.16 + wave;

		return Math.min(1, Math.max(0.18, height));
	});
}

function getRouteEnd(normalizedSpend: number) {
	return 0.34 + normalizedSpend * 0.56;
}

function usePrefersReducedMotion() {
	const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

	React.useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updatePreference = () => {
			setPrefersReducedMotion(mediaQuery.matches);
		};

		updatePreference();
		mediaQuery.addEventListener("change", updatePreference);
		return () => mediaQuery.removeEventListener("change", updatePreference);
	}, []);

	return prefersReducedMotion;
}

export function WrappedFamilySpendScene({
	story,
}: {
	story: WrappedFamilySpendStory;
}) {
	const rootRef = React.useRef<HTMLDivElement>(null);
	const amountRef = React.useRef<HTMLSpanElement>(null);
	const shareCardRef = React.useRef<HTMLDivElement>(null);
	const prefersReducedMotion = usePrefersReducedMotion();

	const boardRows = React.useMemo(() => getBoardRows(story), [story]);
	const barHeights = React.useMemo(
		() => getBarHeights(story.normalizedSpend),
		[story.normalizedSpend],
	);
	const highlightedBarIndex = React.useMemo(() => {
		let bestIndex = 0;

		barHeights.forEach((height, index) => {
			if (height > (barHeights[bestIndex] ?? Number.NEGATIVE_INFINITY)) {
				bestIndex = index;
			}
		});

		return bestIndex;
	}, [barHeights]);
	const summaryCards = React.useMemo(
		() => [
			{
				id: "tokens",
				label: "Tokens on card",
				value: formatCompactWholeNumber(story.totalTokens),
			},
			{
				id: "sessions",
				label: "Sessions on card",
				value: formatNumber(story.sessionCount),
			},
			{
				id: "model",
				label: "Favorite model",
				value: shortenLabel(story.favoriteModel ?? "Autopilot", 18),
			},
		],
		[story.favoriteModel, story.sessionCount, story.totalTokens],
	);
	const routeEnd = React.useMemo(
		() => getRouteEnd(story.normalizedSpend),
		[story.normalizedSpend],
	);
	const shareText = `${story.firstName}'s AI spend card for ${story.periodLabel}, made with rudel.ai`;

	async function captureShareCard() {
		if (!shareCardRef.current) {
			return null;
		}

		return captureElement(shareCardRef.current);
	}

	async function handleCopyImage() {
		const imageBlob = await captureShareCard();

		if (!imageBlob) {
			return;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success("Card copied to clipboard");
			return;
		}

		toast.error("Could not copy the card. Try downloading it instead.");
	}

	async function handleDownloadImage() {
		const imageBlob = await captureShareCard();

		if (!imageBlob) {
			return;
		}

		const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
		downloadAsImage(imageBlob, `rudel-wrapped-card-${timestamp}.png`);
		toast.success("Card downloaded");
	}

	async function handleShareToX() {
		const imageBlob = await captureShareCard();

		if (!imageBlob) {
			return;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success("Card copied. Paste it into your post with Cmd+V.", {
				duration: 8000,
			});
		} else {
			toast.message("X opened without the image. Download if paste is blocked.");
		}

		await new Promise((resolve) => setTimeout(resolve, 1800));
		shareToX(shareText);
	}

	React.useLayoutEffect(() => {
		const scopeElement = rootRef.current;

		if (!scopeElement) {
			return;
		}

		const ctx = gsap.context(() => {
			const boardRowElements = gsap.utils.toArray<HTMLElement>(
				".wf-flighty__board-row",
			);
			const copyElements = gsap.utils.toArray<HTMLElement>(
				".wf-flighty__brand, .wf-flighty__kicker, .wf-flighty__headline, .wf-flighty__lede, .wf-flighty__summary-card, .wf-flighty__share-panel",
			);
			const visualElements = gsap.utils.toArray<HTMLElement>(
				".wf-flighty__glow, .wf-flighty__device-shell",
			);
			const deviceScreen = scopeElement.querySelector<HTMLElement>(
				".wf-flighty__device-screen",
			);
			const chipElements = gsap.utils.toArray<HTMLElement>(".wf-flighty__chip");
			const barElements = gsap.utils.toArray<HTMLElement>(".wf-flighty__bar");
			const routePathElement = scopeElement.querySelector<SVGPathElement>(
				"#wf-flighty-route-path",
			);
			const routePlaneElement = scopeElement.querySelector<HTMLElement>(
				".wf-flighty__route-plane",
			);

			gsap.set(scopeElement, {
				"--wf-flight-glow": 0.22,
			});
			gsap.set(boardRowElements, {
				autoAlpha: 0,
				y: 18,
			});
			gsap.set(copyElements, {
				autoAlpha: 0,
				y: 32,
			});
			gsap.set(visualElements, {
				autoAlpha: 0,
				scale: 0.94,
				y: 34,
			});
			gsap.set(deviceScreen, {
				autoAlpha: 0,
				y: 22,
			});
			gsap.set(chipElements, {
				autoAlpha: 0,
				scale: 0.9,
				y: 14,
			});
			gsap.set(barElements, {
				autoAlpha: 0.24,
				scaleY: 0.14,
				transformOrigin: "50% 100%",
			});
			gsap.set(routePlaneElement, {
				autoAlpha: 0,
				scale: 0.75,
				xPercent: -50,
				yPercent: -50,
			});

			if (amountRef.current) {
				amountRef.current.textContent = formatCurrency(0);
			}

			if (routePathElement) {
				const pathLength = routePathElement.getTotalLength();
				gsap.set(routePathElement, {
					strokeDasharray: pathLength,
					strokeDashoffset: pathLength,
				});
			}

			const amountCounter = { value: 0 };
			const masterTimeline = gsap.timeline();

			masterTimeline
				.to(boardRowElements, {
					autoAlpha: 0.7,
					duration: prefersReducedMotion ? 0.14 : 0.5,
					ease: "power2.out",
					stagger: prefersReducedMotion ? 0 : 0.06,
					y: 0,
				})
				.to(
					copyElements,
					{
						autoAlpha: 1,
						duration: prefersReducedMotion ? 0.18 : 0.68,
						ease: "wfFlightyEnter",
						stagger: prefersReducedMotion ? 0 : 0.07,
						y: 0,
					},
					0.16,
				)
				.to(
					visualElements,
					{
						autoAlpha: 1,
						duration: prefersReducedMotion ? 0.2 : 0.88,
						ease: "wfFlightyEnter",
						scale: 1,
						stagger: prefersReducedMotion ? 0 : 0.05,
						y: 0,
					},
					0.24,
				)
				.to(
					deviceScreen,
					{
						autoAlpha: 1,
						duration: prefersReducedMotion ? 0.16 : 0.54,
						ease: "power2.out",
						y: 0,
					},
					0.46,
				)
				.to(
					amountCounter,
					{
						duration: prefersReducedMotion ? 0.2 : 1.24,
						ease: "wfFlightyCount",
						onUpdate: () => {
							if (amountRef.current) {
								amountRef.current.textContent = formatCurrency(
									amountCounter.value,
								);
							}
						},
						value: story.totalCost,
					},
					0.58,
				)
				.to(
					scopeElement,
					{
						"--wf-flight-glow": 0.38 + story.normalizedSpend * 0.56,
						duration: prefersReducedMotion ? 0.2 : 1.12,
						ease: "power2.out",
					},
					0.58,
				)
				.to(
					barElements,
					{
						autoAlpha: (index) => (index <= highlightedBarIndex ? 0.94 : 0.72),
						duration: prefersReducedMotion ? 0.18 : 0.72,
						ease: "power3.out",
						scaleY: (index) => barHeights[index] ?? 0.3,
						stagger: prefersReducedMotion ? 0 : 0.04,
					},
					0.78,
				)
				.to(
					chipElements,
					{
						autoAlpha: 1,
						duration: prefersReducedMotion ? 0.18 : 0.4,
						ease: "power2.out",
						scale: 1,
						stagger: prefersReducedMotion ? 0 : 0.06,
						y: 0,
					},
					0.96,
				);

			if (routePathElement) {
				const pathLength = routePathElement.getTotalLength();

				masterTimeline.to(
					routePathElement,
					{
						duration: prefersReducedMotion ? 0.18 : 1.1,
						ease: "power2.out",
						strokeDashoffset: pathLength * (1 - routeEnd),
					},
					0.74,
				);
			}

			if (routePlaneElement && routePathElement) {
				masterTimeline
					.to(
						routePlaneElement,
						{
							autoAlpha: 1,
							duration: 0.16,
							scale: 1,
						},
						0.78,
					)
					.to(
						routePlaneElement,
						{
							duration: prefersReducedMotion ? 0.18 : 1.18,
							ease: "power2.inOut",
							motionPath: {
								align: routePathElement,
								alignOrigin: [0.5, 0.5],
								autoRotate: true,
								end: routeEnd,
								path: routePathElement,
								start: 0,
							},
						},
						0.74,
					);
			}

			if (!prefersReducedMotion) {
				const idleTimeline = gsap.timeline({
					delay: 1.4,
					repeat: -1,
					yoyo: true,
				});

				idleTimeline
					.to(
						".wf-flighty__device-shell",
						{
							duration: 3.8,
							ease: "sine.inOut",
							y: -8,
						},
						0,
					)
					.to(
						".wf-flighty__glow",
						{
							duration: 4.2,
							ease: "sine.inOut",
							stagger: 0.16,
							x: (index) => (index % 2 === 0 ? 18 : -16),
							y: (index) => (index % 2 === 0 ? -14 : 10),
						},
						0,
					)
					.to(
						".wf-flighty__bar.is-highlight",
						{
							duration: 2.4,
							ease: "sine.inOut",
							scaleY: `+=${0.05 + story.normalizedSpend * 0.08}`,
						},
						0,
					);
			}
		}, scopeElement);

		return () => {
			ctx.revert();
		};
	}, [
		barHeights,
		highlightedBarIndex,
		prefersReducedMotion,
		routeEnd,
		story.normalizedSpend,
		story.totalCost,
	]);

	return (
		<div ref={rootRef} className="wf-flighty">
			<div className="wf-flighty__ambient" aria-hidden="true">
				<div className="wf-flighty__glow is-purple" />
				<div className="wf-flighty__glow is-orange" />
				<div className="wf-flighty__glow is-blue" />
			</div>

			<div className="wf-flighty__board" aria-hidden="true">
				{boardRows.map((row) => (
					<div key={row.id} className="wf-flighty__board-row">
						<div className="wf-flighty__board-cells">
							{BOARD_CELL_IDS.map((cellId) => (
								<span
									key={`${row.id}-${cellId}`}
									className="wf-flighty__board-cell"
								/>
							))}
						</div>
						<div className="wf-flighty__board-copy">
							<span>{row.left}</span>
							<span>{row.middle}</span>
							<span>{row.right}</span>
							<span>{row.status}</span>
						</div>
					</div>
				))}
			</div>

			<header className="wf-flighty__nav">
				<Link className="wf-flighty__back" to={appRoutes.dashboard()}>
					<ArrowLeft size={16} strokeWidth={2.2} />
					Dashboard
				</Link>
			</header>

			<main className="wf-flighty__hero">
				<section className="wf-flighty__copy">
					<div className="wf-flighty__brand">
						<div className="wf-flighty__brand-copy">
							<p className="wf-flighty__brand-label">Wrapped family</p>
							<p className="wf-flighty__brand-value">{story.periodLabel}</p>
						</div>
					</div>

					<p className="wf-flighty__kicker">Share-ready card</p>
					<h1 className="wf-flighty__headline">
						{"Your spend card is "}
						<span className="wf-flighty__headline-accent">ready.</span>
					</h1>
					<p className="wf-flighty__lede">
						{`We turned ${story.firstName}'s last stretch of usage into one clean card. Copy the image, drop it into Slack, or post it for friends without sharing the rest of your dashboard.`}
					</p>

					<div className="wf-flighty__summary">
						{summaryCards.map((card) => (
							<article key={card.id} className="wf-flighty__summary-card">
								<p className="wf-flighty__summary-label">{card.label}</p>
								<p className="wf-flighty__summary-value">{card.value}</p>
							</article>
						))}
					</div>

					<section className="wf-flighty__share-panel">
						<div className="wf-flighty__share-panel-top">
							<div className="wf-flighty__share-panel-icon">
								<CheckCircle2 size={18} strokeWidth={2.3} />
							</div>
							<div>
								<p className="wf-flighty__share-panel-eyebrow">
									Ready to share
								</p>
								<h2 className="wf-flighty__share-panel-title">
									Only the card gets exported.
								</h2>
							</div>
						</div>
						<p className="wf-flighty__share-panel-copy">
							The image keeps the card exactly as shown on the right and leaves
							the surrounding controls behind.
						</p>
						<div className="wf-flighty__share-actions">
							<button
								type="button"
								className="wf-flighty__share-action is-primary"
								onClick={handleCopyImage}
							>
								<Clipboard size={16} strokeWidth={2.2} />
								Copy image
							</button>
							<button
								type="button"
								className="wf-flighty__share-action"
								onClick={handleDownloadImage}
							>
								<Download size={16} strokeWidth={2.2} />
								Download PNG
							</button>
							<button
								type="button"
								className="wf-flighty__share-action is-quiet"
								onClick={handleShareToX}
							>
								<Twitter size={16} strokeWidth={2.2} />
								Share on X
							</button>
						</div>
					</section>
				</section>

				<section
					className="wf-flighty__visual"
					aria-label="Flighty-inspired spend display"
				>
					<div className="wf-flighty__device-shell">
						<div ref={shareCardRef} className="wf-flighty__device">
							<div className="wf-flighty__device-screen">
								<div className="wf-flighty__device-top">
									<div>
										<p className="wf-flighty__device-kicker">Rudel wrapped</p>
										<p className="wf-flighty__device-period">
											{story.periodLabel}
										</p>
									</div>
									<div className="wf-flighty__signal">
										{story.spendDescriptor}
									</div>
								</div>

								<div className="wf-flighty__amount-block">
									<p className="wf-flighty__amount-label">Total spend</p>
									<p className="wf-flighty__amount">
										<span ref={amountRef} />
									</p>
									<p className="wf-flighty__amount-copy">
										Signals grow warmer as spend climbs. Your season closed with{" "}
										{formatCompactWholeNumber(story.totalTokens)} tokens
										processed.
									</p>
								</div>

								<div className="wf-flighty__route-card">
									<div className="wf-flighty__route-meta">
										<span>{formatBoardDate(story.periodStart)}</span>
										<span>{formatBoardDate(story.periodEnd)}</span>
									</div>
									<svg
										className="wf-flighty__route-svg"
										viewBox="0 0 420 120"
										fill="none"
										aria-hidden="true"
									>
										<path
											className="wf-flighty__route-base"
											d="M26 92 C118 28, 278 24, 392 86"
										/>
										<path
											id="wf-flighty-route-path"
											className="wf-flighty__route-progress"
											d="M26 92 C118 28, 278 24, 392 86"
										/>
									</svg>
									<div className="wf-flighty__route-plane">
										<Plane size={18} strokeWidth={2.2} />
									</div>
								</div>

								<div className="wf-flighty__chips">
									<div className="wf-flighty__chip is-highlight">
										<span className="wf-flighty__chip-label">Sessions</span>
										<span className="wf-flighty__chip-value">
											{formatNumber(story.sessionCount)}
										</span>
									</div>
									<div className="wf-flighty__chip is-highlight">
										<span className="wf-flighty__chip-label">Active days</span>
										<span className="wf-flighty__chip-value">
											{formatNumber(story.activeDays)}
										</span>
									</div>
									<div className="wf-flighty__chip">
										<span className="wf-flighty__chip-label">Model</span>
										<span className="wf-flighty__chip-value">
											{shortenLabel(story.favoriteModel ?? "Autopilot", 16)}
										</span>
									</div>
								</div>

								<div className="wf-flighty__chart" aria-hidden="true">
									{BAR_IDS.map((barId, index) => (
										<span
											key={barId}
											className={`wf-flighty__bar${
												index === highlightedBarIndex ? " is-highlight" : ""
											}`}
											style={
												{
													"--wf-bar-target": barHeights[index] ?? 0,
												} as React.CSSProperties
											}
										/>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>
			</main>
		</div>
	);
}
