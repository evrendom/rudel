import { toPng } from "html-to-image";
import {
	type CSSProperties,
	type ReactNode,
	// biome-ignore lint/style/noRestrictedImports: card capture and flip animation are imperative storyboard bridges.
	useEffect,
	useRef,
	useState,
} from "react";

const TRANSPARENT_IMAGE_PLACEHOLDER =
	"data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
const FLIP_DURATION_MS = 680;
const FACE_SWAP_START_DEG = 88;
const FACE_SWAP_END_DEG = 92;
const SHADOW_FADE_OUT_START_PROGRESS = 0.1;
const SHADOW_FADE_EDGE_PROGRESS = 0.5;
const SHADOW_FADE_IN_END_PROGRESS = 0.9;
const PRINTED_CARD_SURFACE_CAPTURE_PIXEL_RATIO = 4;

interface WrappedPrintedCardFlipProps {
	back: ReactNode;
	captureKey: string;
	front: ReactNode;
	isFrontVisible: boolean;
	reduceMotion?: boolean;
	shouldCaptureBackSurface?: boolean;
}

interface PrintedCardVisualStyle extends CSSProperties {
	"--wrapped-card-back-opacity": number;
	"--wrapped-card-edge-opacity": number;
	"--wrapped-card-flip-rotate-y": string;
	"--wrapped-card-front-opacity": number;
	"--wrapped-card-shadow-opacity": number;
}

export function WrappedPrintedCardFlip(props: WrappedPrintedCardFlipProps) {
	const {
		back,
		captureKey,
		front,
		isFrontVisible,
		reduceMotion = false,
		shouldCaptureBackSurface = true,
	} = props;
	const backSourceRef = useRef<HTMLDivElement | null>(null);
	const flipShellRef = useRef<HTMLDivElement | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const angleRef = useRef(isFrontVisible ? 0 : 180);
	const captureKeyRef = useRef(captureKey);
	const shadowVisibilityRef = useRef(1);
	const [backUrl, setBackUrl] = useState<string | null>(null);
	const [usesWebKitBackTextureOnly] = useState(isAppleWebKitBrowser);
	const visualStyle = resolvePrintedCardVisualStyle(
		angleRef.current,
		shadowVisibilityRef.current,
	);
	const shouldRenderBackSource =
		shouldCaptureBackSurface &&
		(!usesWebKitBackTextureOnly || backUrl === null);

	useEffect(() => {
		let isCancelled = false;

		if (!shouldCaptureBackSurface) {
			setBackUrl(null);
			return;
		}

		if (captureKeyRef.current !== captureKey) {
			captureKeyRef.current = captureKey;

			if (backUrl !== null) {
				setBackUrl(null);
				return;
			}
		}

		if (backUrl !== null) {
			return;
		}

		async function captureBackSurface() {
			const backSource = backSourceRef.current;
			if (!backSource) {
				return;
			}

			try {
				const nextBackUrl = await capturePrintedCardSurface(backSource);
				if (isCancelled || !nextBackUrl) {
					return;
				}

				setBackUrl(nextBackUrl);
			} catch (error) {
				if (!isCancelled) {
					console.warn("Failed to prepare wrapped card back surface", error);
				}
			}
		}

		void captureBackSurface();

		return () => {
			isCancelled = true;
		};
	}, [backUrl, captureKey, shouldCaptureBackSurface]);

	useEffect(() => {
		const targetAngle = isFrontVisible ? 0 : 180;

		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}

		if (reduceMotion) {
			angleRef.current = targetAngle;
			shadowVisibilityRef.current = 1;
			applyPrintedCardVisualStyle(flipShellRef.current, targetAngle);
			return;
		}

		const startAngle = angleRef.current;
		const deltaAngle = targetAngle - startAngle;
		if (Math.abs(deltaAngle) < 0.1) {
			angleRef.current = targetAngle;
			shadowVisibilityRef.current = 1;
			applyPrintedCardVisualStyle(flipShellRef.current, targetAngle);
			return;
		}

		const startTime = performance.now();

		function tick(now: number) {
			const progress = Math.min((now - startTime) / FLIP_DURATION_MS, 1);
			const nextAngle = startAngle + deltaAngle * easeWrappedCardFlip(progress);
			const shadowVisibility = easeWrappedCardShadowVisibility(progress);
			angleRef.current = nextAngle;
			shadowVisibilityRef.current = shadowVisibility;
			applyPrintedCardVisualStyle(
				flipShellRef.current,
				nextAngle,
				shadowVisibility,
			);

			if (progress < 1) {
				animationFrameRef.current = requestAnimationFrame(tick);
				return;
			}

			angleRef.current = targetAngle;
			shadowVisibilityRef.current = 1;
			applyPrintedCardVisualStyle(flipShellRef.current, targetAngle);
			animationFrameRef.current = null;
		}

		animationFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [isFrontVisible, reduceMotion]);

	return (
		<>
			{shouldRenderBackSource ? (
				<div
					aria-hidden="true"
					className="rudel-wrapped-printed-card-flip__source-stage"
				>
					<div
						ref={backSourceRef}
						className="rudel-wrapped-printed-card-flip__source-side"
						data-card-back-texture-source=""
					>
						{back}
					</div>
				</div>
			) : null}

			<div
				ref={flipShellRef}
				className="rudel-wrapped-final-stage__flip-shell"
				data-back-texture-ready={backUrl ? "true" : "false"}
				data-back-texture-strategy={
					usesWebKitBackTextureOnly ? "webkit-png-only" : "standard"
				}
				style={visualStyle}
			>
				<div className="rudel-wrapped-printed-card-flip__rotator">
					<div className="rudel-wrapped-printed-card-flip__plane rudel-wrapped-printed-card-flip__plane--front">
						{front}
					</div>
					<div className="rudel-wrapped-printed-card-flip__plane rudel-wrapped-printed-card-flip__plane--back">
						{backUrl ? (
							<img
								alt="Rudel"
								className="rudel-wrapped-printed-card-flip__image"
								draggable={false}
								src={backUrl}
							/>
						) : !shouldCaptureBackSurface ? (
							<div className="rudel-wrapped-printed-card-flip__live-back">
								{back}
							</div>
						) : (
							<div
								aria-label="Rudel"
								className="rudel-wrapped-printed-card-flip__placeholder"
								data-card-face="back"
								role="img"
							/>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

function isAppleWebKitBrowser() {
	if (typeof navigator === "undefined") {
		return false;
	}

	const { userAgent, vendor } = navigator;
	const isAppleVendor = vendor.includes("Apple");
	const isWebKit = userAgent.includes("AppleWebKit");
	const isDesktopChromium = /\b(?:Chrome|Chromium|Edg|OPR)\//u.test(userAgent);

	return isAppleVendor && isWebKit && !isDesktopChromium;
}

function resolvePrintedCardVisualStyle(
	angle: number,
	shadowVisibility = 1,
): PrintedCardVisualStyle {
	const visualState = resolvePrintedCardVisualState(angle, shadowVisibility);

	return {
		"--wrapped-card-back-opacity": visualState.backOpacity,
		"--wrapped-card-edge-opacity": visualState.edgeOpacity,
		"--wrapped-card-flip-rotate-y": `${angle}deg`,
		"--wrapped-card-front-opacity": visualState.frontOpacity,
		"--wrapped-card-shadow-opacity": visualState.shadowOpacity,
	};
}

function applyPrintedCardVisualStyle(
	element: HTMLElement | null,
	angle: number,
	shadowVisibility = 1,
) {
	if (!element) {
		return;
	}

	const style = resolvePrintedCardVisualStyle(angle, shadowVisibility);

	element.style.setProperty(
		"--wrapped-card-back-opacity",
		`${style["--wrapped-card-back-opacity"]}`,
	);
	element.style.setProperty(
		"--wrapped-card-edge-opacity",
		`${style["--wrapped-card-edge-opacity"]}`,
	);
	element.style.setProperty(
		"--wrapped-card-flip-rotate-y",
		style["--wrapped-card-flip-rotate-y"],
	);
	element.style.setProperty(
		"--wrapped-card-front-opacity",
		`${style["--wrapped-card-front-opacity"]}`,
	);
	element.style.setProperty(
		"--wrapped-card-shadow-opacity",
		`${style["--wrapped-card-shadow-opacity"]}`,
	);
}

function resolvePrintedCardVisualState(
	angle: number,
	shadowVisibility: number,
) {
	const clampedAngle = Math.min(180, Math.max(0, angle));
	const radians = (clampedAngle / 180) * Math.PI;
	const edgeAmount = Math.sin(radians);
	const frontOpacity =
		clampedAngle <= FACE_SWAP_START_DEG
			? 1
			: clampedAngle >= FACE_SWAP_END_DEG
				? 0
				: (FACE_SWAP_END_DEG - clampedAngle) /
					(FACE_SWAP_END_DEG - FACE_SWAP_START_DEG);
	const backOpacity =
		clampedAngle >= FACE_SWAP_END_DEG
			? 1
			: clampedAngle <= FACE_SWAP_START_DEG
				? 0
				: (clampedAngle - FACE_SWAP_START_DEG) /
					(FACE_SWAP_END_DEG - FACE_SWAP_START_DEG);

	return {
		backOpacity,
		edgeOpacity: 0.02 + edgeAmount * 0.36,
		frontOpacity,
		shadowOpacity: (0.46 + edgeAmount * 0.14) * shadowVisibility,
	};
}

function easeWrappedCardShadowVisibility(progress: number) {
	if (progress < SHADOW_FADE_OUT_START_PROGRESS) {
		return 1;
	}

	if (progress < SHADOW_FADE_EDGE_PROGRESS) {
		return (
			1 -
			smoothStep(
				normalizeProgress(
					progress,
					SHADOW_FADE_OUT_START_PROGRESS,
					SHADOW_FADE_EDGE_PROGRESS,
				),
			)
		);
	}

	if (progress < SHADOW_FADE_IN_END_PROGRESS) {
		return smoothStep(
			normalizeProgress(
				progress,
				SHADOW_FADE_EDGE_PROGRESS,
				SHADOW_FADE_IN_END_PROGRESS,
			),
		);
	}

	return 1;
}

function normalizeProgress(progress: number, start: number, end: number) {
	return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

function smoothStep(progress: number) {
	return progress * progress * (3 - 2 * progress);
}

function easeWrappedCardFlip(progress: number) {
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - (-2 * progress + 2) ** 3 / 2;
}

async function capturePrintedCardSurface(
	element: HTMLElement,
): Promise<string | null> {
	await waitForPrintableSurface(element);

	const rect = element.getBoundingClientRect();
	if (rect.width < 1 || rect.height < 1) {
		return null;
	}

	return toPng(element, {
		backgroundColor: "transparent",
		cacheBust: true,
		imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
		pixelRatio: PRINTED_CARD_SURFACE_CAPTURE_PIXEL_RATIO,
		preferredFontFormat: "woff2",
	});
}

async function waitForPrintableSurface(element: HTMLElement) {
	await document.fonts?.ready.catch(() => undefined);

	const images = Array.from(element.querySelectorAll("img"));
	await Promise.all(
		images.map(
			(image) =>
				new Promise<void>((resolve) => {
					if (image.complete) {
						resolve();
						return;
					}

					const finish = () => resolve();
					image.addEventListener("load", finish, { once: true });
					image.addEventListener("error", finish, { once: true });
				}),
		),
	);

	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}
