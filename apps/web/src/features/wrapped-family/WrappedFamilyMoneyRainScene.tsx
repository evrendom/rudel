import { gsap } from "gsap";
import { CustomBounce } from "gsap/CustomBounce";
import { CustomEase } from "gsap/CustomEase";
import { ArrowLeft, CircleDollarSign, Coins, Sparkles } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	formatCompactWholeNumber,
	formatCurrency,
	formatNumber,
} from "@/lib/format";
import type { WrappedFamilyMoneyRainStory } from "./useWrappedFamilyMoneyRainData";

gsap.registerPlugin(CustomEase, CustomBounce);

CustomEase.create("wmrEnter", "M0,0 C0.12,0.8 0.2,1 1,1");
CustomBounce.create("wmrBounce", {
	squash: 2.2,
	squashID: "wmrBounce-squash",
	strength: 0.8,
});

type RainBallConfig = {
	bottom: number;
	delay: number;
	drift: number;
	duration: number;
	endRotation: number;
	hue: number;
	id: string;
	isPartial: boolean;
	repeatDelay: number;
	size: number;
	startRotation: number;
	xPercent: number;
	zIndex: number;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed: number) {
	let state = seed % 2147483647;

	if (state <= 0) {
		state += 2147483646;
	}

	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

function buildBallConfigs(
	displayBallCount: number,
	totalTokens: number,
	hasPartialBall: boolean,
) {
	if (displayBallCount <= 0) {
		return [] as RainBallConfig[];
	}

	const random = createSeededRandom(Math.max(1, Math.floor(totalTokens)));
	const columnCount = Math.min(
		18,
		Math.max(6, Math.ceil(Math.sqrt(displayBallCount * 1.15))),
	);
	const rowCount = Math.ceil(displayBallCount / columnCount);
	const stackStep = clamp(220 / Math.max(rowCount, 1), 4, 14);

	return Array.from({ length: displayBallCount }, (_, index) => {
		const lane = index % columnCount;
		const row = Math.floor(index / columnCount);
		const laneCenter = (lane + 0.5) / columnCount;
		const laneJitter = (random() - 0.5) * (0.72 / columnCount);
		const xPercent = clamp(laneCenter + laneJitter, 0.05, 0.95);
		const isPartial = hasPartialBall && index === displayBallCount - 1;
		const size = isPartial
			? Math.round(22 + random() * 10)
			: Math.round(28 + random() * 34 + (1 - row / Math.max(rowCount, 1)) * 6);
		const hueBand = index % 3;
		const hue =
			hueBand === 0
				? 42 + random() * 16
				: hueBand === 1
					? 132 + random() * 22
					: 188 + random() * 18;

		return {
			bottom: Math.round(24 + row * stackStep + random() * 8),
			delay: random() * 2.2,
			drift: (random() - 0.5) * Math.max(18, 44 - row * 0.6),
			duration: 1.65 + random() * 0.85 + row * 0.03,
			endRotation: (random() - 0.5) * 48,
			hue,
			id: `money-rain-ball-${index}`,
			isPartial,
			repeatDelay: 0.14 + random() * 0.32,
			size,
			startRotation: (random() - 0.5) * 120,
			xPercent,
			zIndex: 20 + row,
		} satisfies RainBallConfig;
	});
}

function getBallStyle(ball: RainBallConfig): React.CSSProperties {
	return {
		bottom: `${ball.bottom}px`,
		height: `${ball.size}px`,
		left: `${ball.xPercent * 100}%`,
		marginLeft: `${-ball.size / 2}px`,
		width: `${ball.size}px`,
		zIndex: ball.zIndex,
	};
}

function getBallCoreStyle(ball: RainBallConfig): React.CSSProperties {
	const shadowHue = ball.hue + 8;
	const highlightHue = ball.hue - 6;

	return {
		background: ball.isPartial
			? `radial-gradient(circle at 28% 24%, hsla(${highlightHue}, 100%, 94%, 0.9) 0, hsla(${ball.hue}, 96%, 78%, 0.9) 26%, hsla(${ball.hue}, 92%, 56%, 0.88) 58%, hsla(${shadowHue}, 86%, 42%, 0.82) 100%)`
			: `radial-gradient(circle at 28% 24%, hsla(${highlightHue}, 100%, 92%, 0.95) 0, hsla(${ball.hue}, 96%, 76%, 0.98) 26%, hsla(${ball.hue}, 92%, 58%, 1) 58%, hsla(${shadowHue}, 86%, 40%, 1) 100%)`,
		boxShadow: ball.isPartial
			? `0 14px 24px hsla(${shadowHue}, 90%, 42%, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.22), inset 0 -10px 18px rgba(0, 0, 0, 0.1), inset 0 2px 7px rgba(255, 255, 255, 0.32)`
			: `0 16px 30px hsla(${shadowHue}, 90%, 42%, 0.18), inset 0 -10px 18px rgba(0, 0, 0, 0.14), inset 0 2px 7px rgba(255, 255, 255, 0.42)`,
	};
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

function useElementHeight(elementRef: React.RefObject<HTMLElement | null>) {
	const [height, setHeight] = React.useState(0);

	React.useLayoutEffect(() => {
		const element = elementRef.current;

		if (!element) {
			return;
		}

		const updateHeight = () => {
			setHeight(element.clientHeight);
		};

		updateHeight();

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(() => {
			updateHeight();
		});

		observer.observe(element);

		return () => observer.disconnect();
	}, [elementRef]);

	return height;
}

export function WrappedFamilyMoneyRainScene({
	isPreview = false,
	story,
}: {
	isPreview?: boolean;
	story: WrappedFamilyMoneyRainStory;
}) {
	const rootRef = React.useRef<HTMLDivElement>(null);
	const arenaRef = React.useRef<HTMLDivElement>(null);
	const prefersReducedMotion = usePrefersReducedMotion();
	const arenaHeight = useElementHeight(arenaRef);
	const ballConfigs = React.useMemo(
		() =>
			buildBallConfigs(
				story.displayBallCount,
				story.totalTokens,
				story.hasPartialBall,
			),
		[story.displayBallCount, story.hasPartialBall, story.totalTokens],
	);

	React.useLayoutEffect(() => {
		const rootElement = rootRef.current;

		if (!rootElement || prefersReducedMotion || arenaHeight <= 0) {
			return;
		}

		const ctx = gsap.context(() => {
			const copyElements = gsap.utils.toArray<HTMLElement>(
				".wmr-screen__nav-link, .wmr-screen__eyebrow, .wmr-screen__headline, .wmr-screen__lede, .wmr-screen__stat, .wmr-screen__pill, .wmr-screen__stage-shell",
			);
			const glowElements = gsap.utils.toArray<HTMLElement>(".wmr-screen__glow");
			const balls = gsap.utils.toArray<HTMLElement>(".wmr-screen__ball");

			gsap.set(copyElements, {
				autoAlpha: 0,
				y: 24,
			});
			gsap.set(balls, {
				autoAlpha: 0,
			});

			gsap.to(copyElements, {
				autoAlpha: 1,
				duration: 0.82,
				ease: "wmrEnter",
				stagger: 0.06,
				y: 0,
			});

			glowElements.forEach((glowElement, index) => {
				gsap.to(glowElement, {
					duration: 3.8 + index * 0.8,
					ease: "sine.inOut",
					repeat: -1,
					scale: index === 1 ? 1.08 : 1.14,
					x: index === 0 ? 24 : index === 1 ? -18 : 16,
					y: index === 2 ? -24 : 18,
					yoyo: true,
				});
			});

			balls.forEach((ballElement) => {
				const ballCoreElement = ballElement.querySelector<HTMLElement>(
					".wmr-screen__ball-core",
				);
				const size = Number(ballElement.dataset.size);
				const bottom = Number(ballElement.dataset.bottom);
				const drift = Number(ballElement.dataset.drift);
				const duration = Number(ballElement.dataset.duration);
				const delay = Number(ballElement.dataset.delay);
				const repeatDelay = Number(ballElement.dataset.repeatDelay);
				const startRotation = Number(ballElement.dataset.startRotation);
				const endRotation = Number(ballElement.dataset.endRotation);
				const dropDistance = arenaHeight + size + bottom;
				const timeline = gsap.timeline({
					delay,
					repeat: -1,
					repeatDelay,
				});

				timeline.set(ballElement, {
					autoAlpha: 0,
					rotation: startRotation,
					x: -drift * 0.35,
					y: -dropDistance,
				});

				if (ballCoreElement) {
					timeline.set(
						ballCoreElement,
						{
							scaleX: 1,
							scaleY: 1,
							transformOrigin: "50% 100%",
						},
						0,
					);
				}

				timeline.to(
					ballElement,
					{
						autoAlpha: 1,
						duration: 0.05,
						ease: "none",
					},
					0,
				);
				timeline.to(
					ballElement,
					{
						duration,
						ease: "wmrBounce",
						rotation: endRotation,
						x: drift,
						y: 0,
					},
					0,
				);

				if (ballCoreElement) {
					timeline.to(
						ballCoreElement,
						{
							duration,
							ease: "wmrBounce-squash",
							scaleX: 1.18,
							scaleY: 0.82,
						},
						0,
					);
				}

				timeline.to(ballElement, {
					autoAlpha: 0,
					duration: 0.08,
					ease: "none",
				});
			});
		}, rootElement);

		return () => ctx.revert();
	}, [arenaHeight, prefersReducedMotion]);

	const rainSummary =
		story.displayBallCount > 0
			? `${formatNumber(story.displayBallCount)} bouncing ${story.displayBallCount === 1 ? "ball" : "balls"}`
			: "No balls yet";
	const tokenCoverageCopy =
		story.ballCount > 0
			? `${formatCompactWholeNumber(story.representedTokens)} tokens are live in full balls${story.remainderTokens > 0 ? `, plus a smaller remainder drop for ${formatNumber(story.remainderTokens)} extra tokens.` : "."}`
			: story.remainderTokens > 0
				? `You have ${formatNumber(story.remainderTokens)} tokens so far, so the page starts with a smaller partial drop instead of an empty arena.`
				: "Cross 1,000 tokens and the first ball drops.";
	const headline = isPreview
		? "Counting the drops."
		: `${story.firstName}, your tokens made it rain.`;
	const lede = isPreview
		? "Loading your token history, but the rain preview is already live so the route never lands dead."
		: `One ball for every 1,000 tokens. Over ${story.periodLabel}, you pushed ${formatCompactWholeNumber(story.totalTokens)} tokens through the system, so we turned them into a bouncing shower.`;

	return (
		<div ref={rootRef} className="wmr-screen">
			<div className="wmr-screen__ambient" aria-hidden="true">
				<div className="wmr-screen__glow is-gold" />
				<div className="wmr-screen__glow is-emerald" />
				<div className="wmr-screen__glow is-cyan" />
			</div>
			<header className="wmr-screen__nav">
				<Link className="wmr-screen__nav-link" to={appRoutes.wrappedFamily()}>
					<ArrowLeft className="size-4" />
					<span>Wrapped family</span>
				</Link>
				<Link
					className="wmr-screen__nav-link is-secondary"
					to={appRoutes.dashboard()}
				>
					<span>Dashboard</span>
				</Link>
			</header>
			<main className="wmr-screen__hero">
				<section className="wmr-screen__copy">
					<p className="wmr-screen__eyebrow">Wrapped · Money Rain</p>
					<h1 className="wmr-screen__headline">{headline}</h1>
					<p className="wmr-screen__lede">{lede}</p>
					<div className="wmr-screen__stats">
						<div className="wmr-screen__stat">
							<p className="wmr-screen__stat-label">Tokens used</p>
							<p className="wmr-screen__stat-value">
								{formatCompactWholeNumber(story.totalTokens)}
							</p>
						</div>
						<div className="wmr-screen__stat">
							<p className="wmr-screen__stat-label">Balls in play</p>
							<p className="wmr-screen__stat-value">
								{formatNumber(story.displayBallCount)}
							</p>
						</div>
						<div className="wmr-screen__stat">
							<p className="wmr-screen__stat-label">Spend tracked</p>
							<p className="wmr-screen__stat-value">
								{formatCurrency(story.totalCost)}
							</p>
						</div>
					</div>
					<div className="wmr-screen__pills">
						<div className="wmr-screen__pill">
							<Coins className="size-4" />
							<span>{rainSummary}</span>
						</div>
						<div className="wmr-screen__pill">
							<CircleDollarSign className="size-4" />
							<span>{story.periodLabel}</span>
						</div>
						<div className="wmr-screen__pill">
							<Sparkles className="size-4" />
							<span>{story.favoriteModel ?? "Autopilot"}</span>
						</div>
					</div>
				</section>
				<section className="wmr-screen__stage-shell">
					<div className="wmr-screen__stage-top">
						<div>
							<p className="wmr-screen__stage-label">Rain density</p>
							<p className="wmr-screen__stage-value">{rainSummary}</p>
						</div>
						<div className="wmr-screen__stage-chip">
							{isPreview
								? "Preview rain while analytics sync"
								: "1 full ball = 1,000 tokens"}
						</div>
					</div>
					<p className="wmr-screen__stage-note">{tokenCoverageCopy}</p>
					<div ref={arenaRef} className="wmr-screen__arena" aria-hidden="true">
						<div className="wmr-screen__floor" />
						{ballConfigs.length === 0 ? (
							<div className="wmr-screen__empty-state">
								Not enough tokens logged to start the storm.
							</div>
						) : (
							ballConfigs.map((ball) => (
								<div
									key={ball.id}
									className="wmr-screen__ball"
									data-bottom={ball.bottom}
									data-delay={ball.delay}
									data-drift={ball.drift}
									data-duration={ball.duration}
									data-end-rotation={ball.endRotation}
									data-repeat-delay={ball.repeatDelay}
									data-size={ball.size}
									data-start-rotation={ball.startRotation}
									style={getBallStyle(ball)}
								>
									<div
										className="wmr-screen__ball-core"
										style={getBallCoreStyle(ball)}
									>
										<span className="wmr-screen__ball-shine" />
									</div>
								</div>
							))
						)}
					</div>
				</section>
			</main>
		</div>
	);
}
