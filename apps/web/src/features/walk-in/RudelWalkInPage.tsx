import { useAnimate } from "motion/react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { thinkerAchievementCopy, thinkerTradingCardTemplate } from "@/features/walk-in/data/thinker-achievement";
import {
	ensureExternalScript,
	ensureExternalStylesheet,
	MYMIND_ACHIEVEMENTS_STYLES_URL,
	MYMIND_CLOUD_AUDIO_URL,
	MYMIND_GSAP_SCRIPT_URL,
	MYMIND_TRADING_CARD_SCRIPT_URL,
	type MymindTradingCardInstance,
	type MymindTradingCardOptions,
} from "@/features/walk-in/lib/mymind-runtime";
import "@/features/walk-in/walk-in-clone.css";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount.
 *
 *      0ms   route takes over the viewport, body locks, cloud shell mounts
 *    350ms   external mymind runtime boots and the TradingCard scene mounts
 *    600ms   fallback reveal fires only if the runtime hasn't already triggered
 *   3000ms   title, description, close button, and CTA fade in (100ms stagger)
 *   3600ms   crest mask settles into place over the unlocked heading
 *   on flip  clouds compress, blast outward, then reform behind the card
 *   on exit  wrapper fades down and navigation returns to the dashboard
 * ───────────────────────────────────────────────────────── */

const TIMING = {
	runtimeFallbackReveal: 600, // backup reveal if the remote runtime doesn't call the hook
	textRevealDelay: 3000, // overlay copy becomes visible after the cloud intro
	textRevealStagger: 100, // individual overlay elements cascade in
	crestRevealDelay: 3600, // crest settles after the staged text
	pivotCompress: 600, // cloud shell tightens before the outward burst
	pivotBlastDelay: 600, // delay before the blast stage starts
	pivotBlastDuration: 1400, // cloud burst duration
	pivotReturnDelay: 1500, // delay before the cloud re-forms behind the card
	pivotReturnDuration: 2500, // cloud settle-back duration
	exitDuration: 420, // route fade-out duration on dismiss
} as const;

const EASING = {
	softOut: [0.22, 1, 0.36, 1],
	softInOut: [0.76, 0, 0.24, 1],
} as const;

function renderTextWithBreaks(text: string) {
	return text.split("\n").map((segment, index) => (
		<React.Fragment key={`${segment}-${index}`}>
			{index > 0 ? <br /> : null}
			{segment}
		</React.Fragment>
	));
}

function CrestMark() {
	return (
		<svg
			viewBox="0 0 149 39"
			fill="none"
			width="149"
			height="39"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M9.8641 7.14143C9.60066 8.59553 8.60889 9.58732 7.08761 9.58732C5.96411 8.59553 6.68986 5.28956 6.68986 5.28956C6.68986 5.28956 5.89696 6.67913 5.96149 9.38844C4.50739 8.99069 3.91073 7.60374 4.17679 6.14964C4.83799 2.58025 8.21114 0 8.21114 0C8.21114 0 10.4581 3.37302 9.8641 7.14143Z"
				fill="white"
			/>
			<path
				d="M7.48341 21.2256C8.73863 22.4808 9.1364 24.0693 8.07746 25.5234C6.35987 25.9857 3.58338 23.142 3.58338 23.142C3.58338 23.142 4.44347 24.8622 7.15278 26.5797C5.83039 27.7704 4.04569 27.5043 2.7233 26.2491C-0.184898 23.6043 -0.184898 19.7689 0.145699 17.7852C2.52448 20.6959 5.16903 18.7771 7.48341 21.2256Z"
				fill="white"
			/>
			<path
				d="M7.41875 13.8164C7.88107 15.5366 7.55048 17.0552 5.89748 17.9153C4.17731 17.5176 3.05381 13.6847 3.05381 13.6847C3.05381 13.6847 2.98666 15.6011 4.63962 18.3803C2.91945 18.778 1.46536 17.7191 0.871338 15.9989C-0.451051 12.2952 1.33366 8.92479 2.52432 7.33594C3.2527 11.0397 6.49156 10.6448 7.41875 13.8164Z"
				fill="white"
			/>
			<path
				d="M11.3186 27.0406C13.0388 27.3712 14.294 28.4302 14.2268 30.2794C13.1033 31.669 9.20067 30.8734 9.20067 30.8734C9.20067 30.8734 10.9208 31.7981 14.0925 31.6663C13.6947 33.3865 12.0417 34.1794 10.257 33.9133C6.35701 33.3193 4.23907 30.2096 3.31445 28.4249C6.889 29.489 8.01297 26.3794 11.3186 27.0406Z"
				fill="white"
			/>
			<path
				d="M17.7323 32.067C19.517 31.9353 20.9711 32.5965 21.436 34.3812C20.7076 35.967 16.7405 36.2976 16.7405 36.2976C16.7405 36.2976 18.6569 36.7599 21.6994 35.7681C21.7666 37.5528 20.377 38.7435 18.5923 38.9424C14.6923 39.4047 11.7814 36.9588 10.459 35.5047C14.0956 35.5719 14.4263 32.3304 17.7323 32.067Z"
				fill="white"
			/>
			<path
				d="M138.95 7.14143C139.214 8.59553 140.206 9.58732 141.727 9.58732C142.85 8.59553 142.125 5.28956 142.125 5.28956C142.125 5.28956 142.917 6.67913 142.853 9.38844C144.307 8.99069 144.904 7.60374 144.638 6.14964C143.976 2.58025 140.603 0 140.603 0C140.603 0 138.356 3.37302 138.95 7.14143Z"
				fill="white"
			/>
			<path
				d="M141.333 21.2256C140.078 22.4808 139.68 24.0693 140.739 25.5234C142.457 25.9857 145.233 23.142 145.233 23.142C145.233 23.142 144.373 24.8622 141.664 26.5797C142.986 27.7704 144.771 27.5043 146.093 26.2491C149.001 23.6043 149.001 19.7689 148.671 17.7852C146.292 20.6959 143.647 18.7771 141.333 21.2256Z"
				fill="white"
			/>
			<path
				d="M141.396 13.8164C140.933 15.5366 141.264 17.0552 142.917 17.9153C144.637 17.5176 145.761 13.6847 145.761 13.6847C145.761 13.6847 145.828 15.6011 144.175 18.3803C145.895 18.778 147.349 17.7191 147.943 15.9989C149.266 12.2952 147.481 8.92479 146.29 7.33594C145.562 11.0397 142.323 10.6448 141.396 13.8164Z"
				fill="white"
			/>
			<path
				d="M137.498 27.0406C135.778 27.3712 134.522 28.4302 134.59 30.2794C135.713 31.669 139.616 30.8734 139.616 30.8734C139.616 30.8734 137.896 31.7981 134.724 31.6663C135.122 33.3865 136.775 34.1794 138.559 33.9133C142.459 33.3193 144.577 30.2096 145.502 28.4249C141.927 29.489 140.803 26.3794 137.498 27.0406Z"
				fill="white"
			/>
			<path
				d="M131.084 32.067C129.299 31.9353 127.845 32.5965 127.38 34.3812C128.109 35.967 132.076 36.2976 132.076 36.2976C132.076 36.2976 130.16 36.7599 127.117 35.7681C127.05 37.5528 128.439 38.7435 130.224 38.9424C134.124 39.4047 137.035 36.9588 138.357 35.5047C134.721 35.5719 134.39 32.3304 131.084 32.067Z"
				fill="white"
			/>
		</svg>
	);
}

export function RudelWalkInPage() {
	const navigate = useNavigate();
	const [scope, animate] = useAnimate();
	const audioRef = React.useRef<HTMLAudioElement | null>(null);
	const cardRuntimeRef = React.useRef<MymindTradingCardInstance | null>(null);
	const playbackTimeoutsRef = React.useRef<number[]>([]);
	const hasRevealedRef = React.useRef(false);
	const hasPivotedRef = React.useRef(false);
	const isClosingRef = React.useRef(false);

	const clearPlaybackTimeouts = React.useCallback(() => {
		for (const timeoutId of playbackTimeoutsRef.current) {
			window.clearTimeout(timeoutId);
		}
		playbackTimeoutsRef.current = [];
	}, []);

	const navigateHome = React.useEffectEvent(() => {
		navigate(appRoutes.dashboard());
	});

	const dismissExperience = React.useEffectEvent(async () => {
		if (isClosingRef.current) {
			return;
		}

		isClosingRef.current = true;
		document.body.classList.remove("scene-is-loading");

		try {
			await Promise.all([
				animate(
					".achievement-wrapper",
					{
						filter: ["blur(0px)", "blur(18px)"],
						opacity: [1, 0],
					},
					{
						duration: TIMING.exitDuration / 1000,
						ease: EASING.softInOut,
					},
				),
				animate(
					".mymind-walk-in__status",
					{ opacity: [1, 0], y: [0, 16] },
					{
						duration: TIMING.exitDuration / 1000,
						ease: EASING.softInOut,
					},
				),
			]);
		} catch {
			// Ignore interrupted timeline work when the route unmounts.
		}

		navigateHome();
	});

	React.useEffect(() => {
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				dismissExperience();
			}
		}
	}, [dismissExperience]);

	React.useEffect(() => {
		let isDisposed = false;
		const removeAchievementsStylesheet = ensureExternalStylesheet(
			MYMIND_ACHIEVEMENTS_STYLES_URL,
		);
		const previousCallbacks = {
			allowAnotherClick: window.allowAnotherClick,
			rootPivotAnimation: window.rootPivotAnimation,
			rootRevealScene: window.rootRevealScene,
		};

		document.body.classList.add("mymind-walk-in-body", "scene-is-loading");

		const rootRevealScene = () => {
			if (hasRevealedRef.current) {
				return;
			}

			const wrapper = scope.current?.querySelector(".achievement-wrapper");
			const clouds = scope.current?.querySelector(".achi-cloud");
			const crest = scope.current?.querySelector(".achievement-unlocked svg");

			if (!(wrapper instanceof HTMLElement) || !(clouds instanceof HTMLElement)) {
				return;
			}

			hasRevealedRef.current = true;
			wrapper.classList.add("achievement-wrapper-playing");

			void animate(
				wrapper,
				{ opacity: [0, 1] },
				{ duration: 2, ease: EASING.softOut },
			);
			void animate(
				clouds,
				{ scale: [2.2, 1.6] },
				{ duration: 3, ease: EASING.softOut },
			);
			void animate(
				clouds,
				{ rotate: [0, -360] },
				{ duration: 30, ease: "linear", repeat: Number.POSITIVE_INFINITY },
			);

			const stagedNodes = Array.from(
				scope.current?.querySelectorAll(".a-stag") ?? [],
			);
			for (const [index, node] of stagedNodes.entries()) {
				if (!(node instanceof HTMLElement)) {
					continue;
				}

				void animate(
					node,
					{
						opacity: [0, 1],
						transform: ["translateY(16px)", "translateY(0px)"],
						visibility: ["hidden", "visible"],
					},
					{
						delay:
							(TIMING.textRevealDelay + index * TIMING.textRevealStagger) / 1000,
						duration: 0.4,
						ease: EASING.softOut,
					},
				);
			}

			if (crest instanceof SVGElement) {
				crest.style.transform = "translate(-74px, -12px)";
				const crestTimer = window.setTimeout(() => {
					crest.style.maskImage =
						"linear-gradient(transparent -20%, rgb(0, 0, 0) 0%)";
					void animate(
						crest,
						{ transform: ["translate(-74px, -12px)", "translate(-74px, 0px)"] },
						{ duration: 1.2, ease: EASING.softOut },
					);
				}, TIMING.crestRevealDelay);
				playbackTimeoutsRef.current.push(crestTimer);
			}
		};

		const rootPivotAnimation = (fullTurn = false) => {
			if (fullTurn || hasPivotedRef.current) {
				return;
			}

			const wrapper = scope.current?.querySelector(".achievement-wrapper");
			const cloudsParent = scope.current?.querySelector(".achi-cloud-parent");

			if (
				!(wrapper instanceof HTMLElement) ||
				!(cloudsParent instanceof HTMLElement)
			) {
				return;
			}

			hasPivotedRef.current = true;
			wrapper.classList.add("achievement-wrapper-flipped");

			void animate(
				cloudsParent,
				{ scale: [1, 0.96] },
				{ duration: TIMING.pivotCompress / 1000, ease: EASING.softInOut },
			);

			const blastTimer = window.setTimeout(() => {
				void animate(
					cloudsParent,
					{
						opacity: [1, 0],
						rotate: [0, -60],
						scale: [0.96, 2.5],
					},
					{
						duration: TIMING.pivotBlastDuration / 1000,
						ease: EASING.softOut,
					},
				);
			}, TIMING.pivotBlastDelay);

			const returnTimer = window.setTimeout(() => {
				void animate(
					cloudsParent,
					{
						opacity: [0, 1],
						scale: [2.5, 1],
					},
					{
						duration: TIMING.pivotReturnDuration / 1000,
						ease: EASING.softOut,
					},
				);
			}, TIMING.pivotReturnDelay);

			playbackTimeoutsRef.current.push(blastTimer, returnTimer);
		};

		const allowAnotherClick = () => {
			document.body.classList.remove("scene-is-loading");
		};

		window.rootRevealScene = rootRevealScene;
		window.rootPivotAnimation = rootPivotAnimation;
		window.allowAnotherClick = allowAnotherClick;

		void bootstrap();

		return () => {
			isDisposed = true;
			clearPlaybackTimeouts();
			audioRef.current?.pause();
			audioRef.current = null;
			cardRuntimeRef.current?.dispose();
			cardRuntimeRef.current = null;
			document.body.classList.remove("mymind-walk-in-body", "scene-is-loading");
			removeAchievementsStylesheet();
			window.allowAnotherClick = previousCallbacks.allowAnotherClick;
			window.rootPivotAnimation = previousCallbacks.rootPivotAnimation;
			window.rootRevealScene = previousCallbacks.rootRevealScene;
		};

		async function bootstrap() {
			try {
				await ensureExternalScript(MYMIND_GSAP_SCRIPT_URL);
				await ensureExternalScript(MYMIND_TRADING_CARD_SCRIPT_URL);

				if (isDisposed) {
					return;
				}

				const cloudAudio = new Audio(MYMIND_CLOUD_AUDIO_URL);
				cloudAudio.volume = 0.15;
				void cloudAudio.play().catch(() => {});
				audioRef.current = cloudAudio;

				const container = scope.current?.querySelector(".achievement-canvas");
				if (!(container instanceof HTMLElement) || !window.TradingCard) {
					throw new Error("TradingCard runtime did not initialize");
				}

				const tradingCardData: MymindTradingCardOptions = {
					...thinkerTradingCardTemplate,
					container,
				};

				cardRuntimeRef.current = new window.TradingCard(tradingCardData);

				const fallbackRevealTimer = window.setTimeout(() => {
					if (!hasRevealedRef.current) {
						rootRevealScene();
					}
				}, TIMING.runtimeFallbackReveal);

				playbackTimeoutsRef.current.push(fallbackRevealTimer);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown runtime error";
				console.error("Failed to boot the mymind walk-in clone", message);
			}
		}
	}, [animate, clearPlaybackTimeouts, dismissExperience, scope]);

	return (
		<div ref={scope} className="mymind-walk-in-route">
			<div className="achievement-wrapper">
				<div className="achi-cloud-parent">
					<div className="achi-cloud achi-cloud-light-dark" />
				</div>

				<div className="achievement-content">
					<div className="achievement-unlocked">
						<CrestMark />
						<h2 className="a-stag">
							{thinkerAchievementCopy.title}
							<br />
							Unlocked
						</h2>
					</div>

					<div className="achievement-canvas" />
					<p className="achievement-description a-stag">
						{renderTextWithBreaks(thinkerAchievementCopy.unlockedDescription)}
					</p>
					<button
						className="achievement-view-all achievement-dismiss a-stag"
						type="button"
						onClick={dismissExperience}
					>
						View all Achievements
					</button>
				</div>

				<button
					aria-label="Close"
					className="achievement-close a-stag"
					type="button"
					onClick={dismissExperience}
				>
					<svg
						viewBox="0 0 20 20"
						fill="none"
						width="20"
						height="20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M4.78668 4.78798L14.3598 14.3611"
							stroke="white"
							strokeWidth="1.77778"
							strokeLinecap="round"
						/>
						<path
							d="M14.3596 4.78798L4.78648 14.3611"
							stroke="white"
							strokeWidth="1.77778"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className="mymind-walk-in__status">
				<span className="mymind-walk-in__status-dot" />
				<span>Captured flow: {thinkerAchievementCopy.title}</span>
			</div>
		</div>
	);
}
